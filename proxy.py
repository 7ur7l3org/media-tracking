from flask import Flask, request, Response
from flask_cors import CORS
import requests

app = Flask(__name__)
CORS(app, supports_credentials=True)

# Explicitly handle OPTIONS (preflight) requests
@app.before_request
def handle_options():
    if request.method == 'OPTIONS':
        response = app.make_default_options_response()
        headers = response.headers
        headers['Access-Control-Allow-Origin'] = '*'
        headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
        headers['Access-Control-Allow-Headers'] = request.headers.get('Access-Control-Request-Headers', '*')
        return response

@app.route('/', defaults={'path': ''}, methods=['GET', 'POST'])
@app.route('/<path:path>', methods=['GET', 'POST'])
def proxy(path):
    target_url = "https://" + path
    if request.query_string:
        target_url += "?" + request.query_string.decode('utf-8')
    # Forward all incoming headers except 'Host'
    headers = {key: value for key, value in request.headers.items() if key.lower() != 'host'}
    resp = requests.request(
        method=request.method,
        url=target_url,
        headers=headers,
        data=request.get_data(),
        cookies=request.cookies,
        allow_redirects=False
    )
    # Remove hop-by-hop headers
    excluded = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']
    response_headers = [(name, value) for (name, value) in resp.headers.items() if name.lower() not in excluded]
    response = Response(resp.content, resp.status_code, response_headers)
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response

if __name__ == "__main__":
    app.run(port=8088)
