import http.server
import ssl

server_address = ('0.0.0.0', 8000)  # Serve on all interfaces, port 8000
httpd = http.server.HTTPServer(server_address, http.server.SimpleHTTPRequestHandler)

httpd.socket = ssl.wrap_socket(httpd.socket,
                               server_side=True,
                               certfile='server.pem',
                               ssl_version=ssl.PROTOCOL_TLS)

print("Serving on https://localhost:8000")
httpd.serve_forever()
