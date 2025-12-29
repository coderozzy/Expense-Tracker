#!/usr/bin/env python3

import http.server
import socketserver
import os
import sys
from urllib.parse import urlparse

class PWAHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):

        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')

        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        
        super().end_headers()
    
    def do_GET(self):

        if self.path == '/' or not os.path.exists(self.path[1:]):
            self.path = '/index.html'
        return super().do_GET()

def main(port=8000):
    PORT = port

    try:
        with socketserver.TCPServer(("", PORT), PWAHandler) as httpd:
            print(f"🚀 Expense Tracker PWA Server")
            print(f"📱 Server running at: http://localhost:{PORT}")
            print(f"🌐 Access the app at: http://localhost:{PORT}")
            print(f"📋 Features available:")
            print(f"   - PWA Installation")
            print(f"   - Offline Support")
            print(f"   - Camera Integration")
            print(f"   - Geolocation")
            print(f"   - Responsive Design")
            print(f"\n💡 For PWA features, use HTTPS in production")
            print(f"🛑 Press Ctrl+C to stop the server")
            
            httpd.serve_forever()
    except OSError as e:
        if e.errno == 48:
            print(f"❌ Port {PORT} is already in use. Try a different port.")
            print(f"💡 You can specify a different port: python3 server.py {PORT + 1}")
        else:
            print(f"❌ Error starting server: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print(f"\n🛑 Server stopped by user")
        sys.exit(0)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        try:
            PORT = int(sys.argv[1])
        except ValueError:
            print("❌ Invalid port number. Using default port 8000.")
            PORT = 8000
    else:
        PORT = 8000
    main(PORT)
