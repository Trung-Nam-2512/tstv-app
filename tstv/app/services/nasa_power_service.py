import httpx
import logging
import pandas as pd
import io
import json
from typing import Dict, Any, Optional
from datetime import datetime
from fastapi import HTTPException

logger = logging.getLogger(__name__)

class NasaPowerService:
    """Service để lấy dữ liệu nhiệt độ từ NASA POWER API"""
    
    def __init__(self):
        # NASA POWER API base URL
        self.api_base_url = "https://power.larc.nasa.gov/api/temporal/daily/point"
    
    async def fetch_temperature_data(
        self,
        lat: float,
        lon: float,
        start_year: int,
        end_year: int
    ) -> pd.DataFrame:
        """
        Lấy dữ liệu nhiệt độ từ NASA POWER API
        
        Args:
            lat: Vĩ độ
            lon: Kinh độ
            start_year: Năm bắt đầu
            end_year: Năm kết thúc
            
        Returns:
            DataFrame chứa dữ liệu nhiệt độ với cột: Year, Month, Day, T2M (nhiệt độ trung bình)
            
        Raises:
            HTTPException: Khi API call thất bại
        """
        try:
            # Validate inputs
            if not (-90 <= lat <= 90):
                raise HTTPException(status_code=400, detail="Vĩ độ phải trong khoảng -90 đến 90")
            if not (-180 <= lon <= 180):
                raise HTTPException(status_code=400, detail="Kinh độ phải trong khoảng -180 đến 180")
            if start_year < 1980 or end_year > datetime.now().year:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Năm phải trong khoảng 1980 đến {datetime.now().year}"
                )
            if start_year > end_year:
                raise HTTPException(status_code=400, detail="Năm bắt đầu phải nhỏ hơn hoặc bằng năm kết thúc")
            
            # Format dates
            start_date = f"{start_year}0101"  # YYYYMMDD
            end_date = f"{end_year}1231"
            
            # Parameters for NASA POWER API
            # Try JSON first as it's more reliable, fallback to CSV if needed
            params = {
                "parameters": "T2M",  # Temperature at 2 meters
                "community": "RE",
                "longitude": lon,
                "latitude": lat,
                "start": start_date,
                "end": end_date,
                "format": "JSON"  # Try JSON first
            }
            
            logger.info(f"Fetching NASA POWER data: lat={lat}, lon={lon}, {start_year}-{end_year}")
            
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(self.api_base_url, params=params)
                
                if response.status_code != 200:
                    logger.error(f"NASA POWER API returned status {response.status_code}: {response.text[:500]}")
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"Lỗi khi gọi NASA POWER API: {response.status_code}"
                    )
                
                # Parse response (try JSON first, then CSV)
                try:
                    response_text = response.text
                    content_type = response.headers.get('content-type', '').lower()
                    
                    # Log first 500 chars for debugging
                    logger.info(f"NASA POWER response preview (first 500 chars): {response_text[:500]}")
                    logger.info(f"Content-Type: {content_type}")
                    
                    df = None
                    
                    # Try JSON format first
                    if 'json' in content_type or response_text.strip().startswith('{'):
                        try:
                            data = json.loads(response_text)
                            
                            # NASA POWER JSON structure: {"properties": {"parameter": {"T2M": {...}}}}
                            if 'properties' in data and 'parameter' in data['properties']:
                                params_data = data['properties']['parameter']
                                if 'T2M' in params_data:
                                    t2m_data = params_data['T2M']
                                    
                                    # Extract dates and values
                                    dates = []
                                    temps = []
                                    for date_str, temp_value in t2m_data.items():
                                        try:
                                            # Date format: YYYYMMDD
                                            date_obj = datetime.strptime(date_str, '%Y%m%d')
                                            dates.append(date_obj)
                                            temps.append(float(temp_value))
                                        except:
                                            continue
                                    
                                    if dates:
                                        df = pd.DataFrame({
                                            'Date': dates,
                                            'Temperature': temps
                                        })
                                        df['Year'] = df['Date'].dt.year
                                        df['Month'] = df['Date'].dt.month
                                        df['Day'] = df['Date'].dt.day
                                        
                                        # Aggregate by Year and Month (lấy max temperature trong tháng)
                                        # Phần mềm phân tích tần suất cần Year, Month, Temperature (không cần Day)
                                        df_aggregated = df.groupby(['Year', 'Month'])['Temperature'].max().reset_index()
                                        df_aggregated.columns = ['Year', 'Month', 'Temperature']
                                        df = df_aggregated
                                        
                                        logger.info(f"Successfully parsed JSON format and aggregated to {len(df)} monthly records")
                        except Exception as e:
                            logger.warning(f"Failed to parse as JSON: {str(e)}, trying CSV...")
                    
                    # If JSON failed, try CSV
                    if df is None or df.empty:
                        csv_content = response_text
                        
                        # Find where the actual data starts (skip metadata header)
                        lines = csv_content.split('\n')
                        data_start_line = 0
                        
                        # Look for header row (usually contains YEAR, MO, DY, or similar)
                        for i, line in enumerate(lines):
                            line_upper = line.upper()
                            if any(keyword in line_upper for keyword in ['YEAR', 'MO', 'DY', 'DATE', 'T2M', 'TEMPERATURE']):
                                data_start_line = i
                                logger.info(f"Found data header at line {i}: {line[:200]}")
                                break
                        
                        # Try to read CSV with different skiprows
                        for skip in [data_start_line, 14, 15, 16, 17, 18]:
                            try:
                                df = pd.read_csv(io.StringIO(csv_content), skiprows=skip)
                                # Check if we have valid columns
                                cols_upper = [col.upper().strip() for col in df.columns]
                                if any('YEAR' in col or 'DATE' in col for col in cols_upper):
                                    logger.info(f"Successfully parsed CSV with skiprows={skip}, columns: {list(df.columns)}")
                                    break
                            except Exception as e:
                                logger.debug(f"Failed to parse with skiprows={skip}: {str(e)}")
                                continue
                    
                    if df is None or df.empty:
                        raise HTTPException(status_code=404, detail="Không có dữ liệu từ NASA POWER API")
                    
                    # Log all columns for debugging
                    logger.info(f"Available columns: {list(df.columns)}")
                    
                    # Map columns flexibly
                    column_mapping = {}
                    cols_upper = {col.upper().strip(): col for col in df.columns}
                    
                    # Find year column
                    for key in ['YEAR', 'Y', 'DATE']:
                        if key in cols_upper:
                            column_mapping[cols_upper[key]] = 'Year'
                            break
                    
                    # Find month column
                    for key in ['MO', 'MONTH', 'M']:
                        if key in cols_upper:
                            column_mapping[cols_upper[key]] = 'Month'
                            break
                    
                    # Find day column
                    for key in ['DY', 'DAY', 'D']:
                        if key in cols_upper:
                            column_mapping[cols_upper[key]] = 'Day'
                            break
                    
                    # Find temperature column
                    temp_col = None
                    for key in ['T2M', 'TEMPERATURE', 'TEMP', 'T']:
                        if key in cols_upper:
                            temp_col = cols_upper[key]
                            column_mapping[temp_col] = 'Temperature'
                            break
                    
                    if not temp_col:
                        # Try to find any column that might be temperature
                        for col in df.columns:
                            if 'T2M' in col.upper() or 'TEMP' in col.upper():
                                temp_col = col
                                column_mapping[col] = 'Temperature'
                                break
                    
                    if not temp_col:
                        logger.error(f"Could not find temperature column. Available columns: {list(df.columns)}")
                        raise HTTPException(
                            status_code=500,
                            detail=f"Không tìm thấy cột nhiệt độ. Các cột có sẵn: {', '.join(df.columns)}"
                        )
                    
                    # Rename columns
                    df = df.rename(columns=column_mapping)
                    
                    # If Year, Month, Day are not separate, try to parse from date
                    if 'Year' not in df.columns and 'Date' in df.columns:
                        try:
                            df['Date'] = pd.to_datetime(df['Date'])
                            df['Year'] = df['Date'].dt.year
                            df['Month'] = df['Date'].dt.month
                            df['Day'] = df['Date'].dt.day
                        except:
                            pass
                    
                    # Convert temperature from Kelvin to Celsius (if needed)
                    if 'Temperature' in df.columns:
                        # Check if values are in Kelvin range (typically > 200)
                        if df['Temperature'].max() > 200:
                            df['Temperature'] = df['Temperature'] - 273.15
                            logger.info("Converted temperature from Kelvin to Celsius")
                    
                    # Remove rows with missing data
                    df = df.dropna(subset=['Temperature'])
                    
                    # Ensure Year, Month are integers (Day không cần vì sẽ aggregate)
                    for col in ['Year', 'Month']:
                        if col in df.columns:
                            df[col] = df[col].astype(int)
                    
                    # Aggregate by Year and Month (lấy max temperature trong tháng)
                    # Phần mềm phân tích tần suất cần: Year, Month, Temperature (không cần Day)
                    # Lấy max để phù hợp với phân tích tần suất (thường dùng giá trị cực đại)
                    if 'Year' in df.columns and 'Month' in df.columns and 'Temperature' in df.columns:
                        df_aggregated = df.groupby(['Year', 'Month'])['Temperature'].max().reset_index()
                        df_aggregated.columns = ['Year', 'Month', 'Temperature']
                        df = df_aggregated
                        logger.info(f"Aggregated to {len(df)} monthly records (max temperature per month)")
                    
                    # Filter only required columns for frequency analysis
                    required_cols = ['Year', 'Month', 'Temperature']
                    df = df[[col for col in required_cols if col in df.columns]]
                    
                    # Ensure data types
                    df['Year'] = df['Year'].astype(int)
                    df['Month'] = df['Month'].astype(int)
                    df['Temperature'] = df['Temperature'].astype(float).round(2)
                    
                    # Sort by Year, Month
                    df = df.sort_values(['Year', 'Month']).reset_index(drop=True)
                    
                    logger.info(f"Successfully fetched and processed {len(df)} monthly records from NASA POWER")
                    logger.info(f"Final columns: {list(df.columns)}")
                    logger.info(f"Year range: {df['Year'].min()} - {df['Year'].max()}")
                    logger.info(f"Sample data:\n{df.head(10)}")
                    
                    return df
                        
                except pd.errors.EmptyDataError:
                    raise HTTPException(status_code=404, detail="Không có dữ liệu từ NASA POWER API")
                except HTTPException:
                    raise
                except Exception as e:
                    logger.error(f"Error parsing NASA POWER response: {str(e)}")
                    logger.error(f"Response content (first 1000 chars): {response.text[:1000]}")
                    raise HTTPException(status_code=500, detail=f"Lỗi khi xử lý dữ liệu: {str(e)}")
                    
        except httpx.TimeoutException:
            logger.error("Timeout when calling NASA POWER API")
            raise HTTPException(status_code=504, detail="Timeout khi gọi NASA POWER API")
        except httpx.RequestError as e:
            logger.error(f"Request error when calling NASA POWER API: {str(e)}")
            raise HTTPException(status_code=503, detail=f"Không thể kết nối đến NASA POWER API: {str(e)}")
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Unexpected error in fetch_temperature_data: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Lỗi không xác định: {str(e)}")
    
    def convert_to_csv(self, df: pd.DataFrame) -> str:
        """
        Chuyển DataFrame thành CSV string
        
        Args:
            df: DataFrame cần chuyển đổi
            
        Returns:
            CSV string
        """
        return df.to_csv(index=False)

