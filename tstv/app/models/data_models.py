from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Union
from datetime import datetime

class UploadManualPayload(BaseModel):
    data: List[Dict[str, Any]]

class StatsResponse(BaseModel):
    stats: Union[List[Dict[str, Any]], Dict[str, Any]]
    has_month: Optional[bool] = None

class FrequencyCurveResponse(BaseModel):
    theoretical_curve: List[Dict[str, Any]]
    empirical_points: List[Dict[str, Any]]

class QQPPResponse(BaseModel):
    qq: List[Dict[str, Any]]
    pp: List[Dict[str, Any]]

class QuantileDataResponse(BaseModel):
    years: List[int]
    qmax_values: List[float]
    histogram: Dict[str, List[Any]]
    theoretical_curve: Dict[str, List[float]]

# Models cho realtime service
class Station(BaseModel):
    station_id: str
    name: Optional[str] = None
    location: Optional[Dict[str, Any]] = None

class Measurement(BaseModel):
    time_point: str
    depth: float

class StationData(BaseModel):
    station_id: str
    value: List[Measurement]

class RealTimeQuery(BaseModel):
    start_time: str
    end_time: str
    station_id: Optional[str] = None

class RealTimeResponse(BaseModel):
    Data: List[StationData]
    status: Optional[str] = None

# Models cho Rainfall service
class RainfallInterpolateRequest(BaseModel):
    latitude: float
    longitude: float
    days: Optional[int] = 30
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    field: Optional[str] = "total_24h"
    k: Optional[int] = 8
    power: Optional[float] = 2.0
    stats: Optional[List[str]] = None

class TimeSeriesPoint(BaseModel):
    date: str
    rainfall: Optional[float] = None

class Location(BaseModel):
    latitude: float
    longitude: float

class DateRange(BaseModel):
    start: str
    end: str

class Parameters(BaseModel):
    field: str
    k: int
    power: float

class Metadata(BaseModel):
    totalDays: int
    availableDays: int
    missingDays: int
    avgConfidence: Optional[float] = None
    quality: Optional[str] = None

class Statistics(BaseModel):
    max: Optional[List[Optional[float]]] = None
    min: Optional[List[Optional[float]]] = None
    mean: Optional[List[Optional[float]]] = None
    sum: Optional[List[Optional[float]]] = None

class RainfallInterpolateResponse(BaseModel):
    timeSeries: List[TimeSeriesPoint]
    location: Location
    dateRange: DateRange
    parameters: Parameters
    metadata: Metadata
    statistics: Optional[Statistics] = None

class RainfallAnalyzeRequest(BaseModel):
    latitude: float
    longitude: float
    days: Optional[int] = 30
    startDate: Optional[str] = None
    endDate: Optional[str] = None
    field: Optional[str] = "total_24h"
    k: Optional[int] = 8
    power: Optional[float] = 2.0
    stats: Optional[List[str]] = None
    data_field: Optional[str] = "rainfall"
    min_threshold: Optional[float] = 0.0

class RainfallAnalysisData(BaseModel):
    data: List[Dict[str, Any]]
    main_column: str
    source: Dict[str, Any]
    metadata: Metadata

class RainfallQueryHistory(BaseModel):
    latitude: float
    longitude: float
    days: int
    field: str
    k: int
    power: float
    data_field: str
    dateRange: DateRange
    result_summary: Dict[str, Any]
    timestamp: datetime
    user_id: Optional[str] = None
