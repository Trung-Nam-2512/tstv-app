export default {
	async fetch(request) {
		const url = new URL(request.url);
		const normalizedPath = url.pathname.replace(/\/+/g, "/");

		const backendUrl = `http://phuongnamdts.com:3143${normalizedPath}${url.search}`;

		const modifiedRequest = new Request(backendUrl, {
			method: request.method,
			headers: request.headers,
			body: request.body,
		});

		return fetch(modifiedRequest);
	},
};
