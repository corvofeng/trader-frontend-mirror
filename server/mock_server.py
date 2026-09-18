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
                
                if action in ['query_price', 'subscribe', 'realtime_subscribe']:
                    contract_codes = message.get('contract_codes', [])
                    print(f"Received {action} for codes: {contract_codes}")
                    
                    response_data = []
                    current_time = int(time.time() * 1000)
                    
                    for code in contract_codes:
                        # Mock logic to generate random price based on some hash of the code
                        base_price = sum(ord(c) for c in code) % 1000 / 100.0 + 1.0
                        
                        # Realtime subscribe might have higher volatility or different behavior
                        vol_range = 0.02 if action == 'realtime_subscribe' else 0.05
                        volatility = random.uniform(-vol_range, vol_range)
                        price = round(base_price * (1 + volatility), 4)
                        
                        response_data.append({
                            "contract_code": code,
                            "price": price,
                            "last_price": price,
                            "bid": round(price * 0.99, 4),
                            "ask": round(price * 1.01, 4),
                            "bid_price": [round(price * (0.99 - i*0.001), 4) for i in range(5)],
                            "ask_price": [round(price * (1.01 + i*0.001), 4) for i in range(5)],
                            "bid_vol": [random.randint(10, 100) for _ in range(5)],
                            "ask_vol": [random.randint(10, 100) for _ in range(5)],
                            "timestamp": current_time
                        })
                    
                    # Send response back to client
                    ws.send(json.dumps(response_data))

                    # If realtime, send another update quickly to simulate high frequency
                    if action == 'realtime_subscribe':
                        time.sleep(0.1)
                        for item in response_data:
                            item['price'] = round(item['price'] * (1 + random.uniform(-0.001, 0.001)), 4)
                            item['timestamp'] = int(time.time() * 1000)
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
