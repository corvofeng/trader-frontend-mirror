from flask import Flask
from flask_sock import Sock
import json
import random
import time
from datetime import datetime

app = Flask(__name__)
sock = Sock(app)

@sock.route('/api/ws/option')
def option(ws):
    """
    WebSocket endpoint for querying real-time option data.
    """
    print("Client connected to /api/ws/option")
    try:
        while True:
            # Receive message from client
            data = ws.receive()
            if not data:
                break
            
            try:
                message = json.loads(data)
                action = message.get('action')
                
                if action == 'query_price':
                    contract_codes = message.get('contract_codes', [])
                    print(f"Received query for codes: {contract_codes}")
                    
                    response_data = []
                    current_time = int(time.time() * 1000)
                    
                    for code in contract_codes:
                        # Mock logic to generate random price based on some hash of the code
                        # In reality, you would query your market data source here
                        base_price = sum(ord(c) for c in code) % 1000 / 100.0 + 1.0
                        volatility = random.uniform(-0.05, 0.05)
                        price = round(base_price * (1 + volatility), 4)
                        
                        response_data.append({
                            "contract_code": code,
                            "price": price,
                            "bid": round(price * 0.99, 4),
                            "ask": round(price * 1.01, 4),
                            "timestamp": current_time
                        })
                    
                    # Send response back to client
                    # Can send as a list or individual updates
                    ws.send(json.dumps(response_data))

                elif action == 'ping':
                    ws.send(json.dumps({"action": "pong", "timestamp": int(time.time() * 1000)}))
                    
            except json.JSONDecodeError:
                print(f"Invalid JSON received: {data}")
            except Exception as e:
                print(f"Error processing message: {e}")
                
    except Exception as e:
        print(f"WebSocket connection closed: {e}")
    finally:
        print("Client disconnected")

if __name__ == '__main__':
    # Run on port 8000 to match frontend default
    print("Starting Flask WebSocket server on port 8000...")
    # Ensure threaded=True to handle multiple connections and not block
    app.run(host='0.0.0.0', port=8000, threaded=True)
