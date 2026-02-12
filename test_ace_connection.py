import grpc
import os

# User provided key
API_KEY = "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"
URL = "grpc.nvcf.nvidia.com:443"

def test_connection():
    print(f"Testing connection to {URL}...")
    try:
        creds = grpc.ssl_channel_credentials()
        call_creds = grpc.metadata_call_credentials(
            lambda context, callback: callback((("authorization", f"Bearer {API_KEY}"),), None)
        )
        composite_creds = grpc.composite_channel_credentials(creds, call_creds)
        channel = grpc.secure_channel(URL, composite_creds)
        
        # Try to connect (wait for ready)
        grpc.channel_ready_future(channel).result(timeout=10)
        print("Successfully connected to NVIDIA ACE!")
        return True
    except grpc.FutureTimeoutError:
        print("Connection timed out.")
        return False
    except Exception as e:
        print(f"Connection failed: {e}")
        return False

if __name__ == "__main__":
    test_connection()
