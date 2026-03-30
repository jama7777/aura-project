import os
import grpc
import time
import numpy as np
import wave
from typing import List, Dict, Any
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# NVIDIA ACE Imports
try:
    from nvidia_ace import audio_pb2
    from nvidia_audio2face_3d import audio2face_pb2_grpc
    from nvidia_audio2face_3d import messages_pb2
except ImportError:
    print("WARNING: NVIDIA ACE packages not found. Please install `nvidia-audio2face-3d`.")

class NvidiaACEClient:
    def __init__(self, api_key=None, url="grpc.nvcf.nvidia.com:443", function_id=None):
        self.api_key = api_key or os.getenv("NV_API_KEY")
        self.url = url
        # Using the function ID for Audio2Face-3D (Mark model) on NVCF
        self.function_id = function_id or "8efc55f5-6f00-424e-afe9-26212cd2c630" 
        self.channel = None
        self.stub = None
        
        if not self.api_key:
            print("WARNING: NV_API_KEY is not set. API calls will fail.")

    def connect(self):
        if not self.api_key:
            return False
            
        try:
            creds = grpc.ssl_channel_credentials()
            
            # Helper to add metadata
            def metadata_callback(context, callback):
                callback((("authorization", f"Bearer {self.api_key}"), ("function-id", self.function_id)), None)

            call_creds = grpc.metadata_call_credentials(metadata_callback)
            composite_creds = grpc.composite_channel_credentials(creds, call_creds)
            self.channel = grpc.secure_channel(self.url, composite_creds)
            
            try:
                self.stub = audio2face_pb2_grpc.A2FControllerServiceStub(self.channel)
                print(f"Connected to NVIDIA ACE at {self.url}")
                return True
            except NameError:
                 print("NVIDIA ACE libraries not imported correctly.")
                 return False

        except Exception as e:
            print(f"Failed to connect to NVIDIA ACE: {e}")
            return False

    def _get_emotion_params(self, emotion: str) -> Dict[str, float]:
        """Maps simple emotion names to A2F emotion weights."""
        emo_map = {
            "happy": {"happiness": 1.0},
            "funny": {"happiness": 1.0},
            "excited": {"happiness": 0.8, "amazement": 0.4},
            "sad": {"sadness": 1.0},
            "tired": {"sadness": 0.5},
            "surprised": {"amazement": 1.0},
            "angry": {"anger": 1.0},
            "grateful": {"happiness": 0.6},
            "neutral": {"neutral": 1.0}
        }
        return emo_map.get(emotion.lower(), {"neutral": 1.0})

    def process_audio(self, audio_file_path, emotion="neutral"):
        """
        Sends audio to ACE and returns animation data.
        Returns a list of blendshape frames.
        """
        if not self.api_key:
             self.api_key = os.getenv("NV_API_KEY")

        if not self.channel or not self.stub:
            if not self.connect():
                print("NVIDIA ACE not connected. Returning None.")
                return None

        print(f"Sending {audio_file_path} to NVIDIA ACE with emotion: {emotion}...")
        
        try:
            # Open audio file
            with wave.open(audio_file_path, 'rb') as wf:
                params = wf.getparams()
                framerate = params.framerate
                nchannels = params.nchannels
                sampwidth = params.sampwidth
                nframes = params.nframes
                audio_data = wf.readframes(nframes)
                
            # Request Generator
            def request_generator():
                # 1. Send Header
                audio_header = audio_pb2.AudioHeader(
                    audio_format=audio_pb2.AudioHeader.AUDIO_FORMAT_PCM,
                    channel_count=nchannels,
                    samples_per_second=framerate,
                    bits_per_sample=sampwidth * 8
                )
                
                # Setup emotion parameters
                emotion_weights = self._get_emotion_params(emotion)
                emotion_params = messages_pb2.EmotionParameters(
                    beginning_emotion=emotion_weights
                )

                header = messages_pb2.AudioWithEmotionStreamHeader(
                    audio_header=audio_header,
                    emotion_params=emotion_params,
                    face_params=messages_pb2.FaceParameters(
                        float_params={} 
                    )
                )
                
                yield messages_pb2.AudioWithEmotionStream(audio_stream_header=header)
                
                # 2. Send Audio Data in chunks
                chunk_size = 4096 * 2 # bytes
                for i in range(0, len(audio_data), chunk_size):
                    chunk = audio_data[i:i+chunk_size]
                    audio_msg = messages_pb2.AudioWithEmotion(audio_buffer=chunk)
                    yield messages_pb2.AudioWithEmotionStream(audio_with_emotion=audio_msg)
                    
                # 3. Send End of Audio (optional, or just end of stream? Proto has explicit message if needed)
                # The proto definition has `end_of_audio` field in AudioWithEmotionStream.
                # It's a message type `EndOfAudio`.
                yield messages_pb2.AudioWithEmotionStream(end_of_audio=messages_pb2.AudioWithEmotionStream.EndOfAudio())

            # Call API with timeout to prevent permanent server freeze on external API hang
            response_stream = self.stub.ProcessAudioStream(request_generator(), timeout=15.0)
            
            # Process Responses
            animations = []
            blendshape_names = []
            
            for response in response_stream:
                if response.HasField("animation_data_stream_header"):
                    # Capture blendshape names
                    header = response.animation_data_stream_header
                    if header.HasField("skel_animation_header"):
                        blendshape_names = list(header.skel_animation_header.blend_shapes)
                        
                if response.HasField("animation_data"):
                    anim_data = response.animation_data
                    if anim_data.HasField("skel_animation"):
                        skel_anim = anim_data.skel_animation
                        # blend_shape_weights is repeated FloatArrayWithTimeCode
                        for item in skel_anim.blend_shape_weights:
                            time_code = item.time_code
                            weights = item.values # array of floats
                            
                            if not blendshape_names:
                                continue # Cannot map without names
                                
                            shapes = {}
                            # Map names to weights
                            for i, name in enumerate(blendshape_names):
                                if i < len(weights):
                                    val = weights[i]
                                    
                                    # DAMPING LOGIC: Reduce extreme mouth spreading
                                    # Applying 25% damping (0.75 multiplier) to wide-mouth shapes
                                    if "mouthStretch" in name or "mouthPucker" in name or "mouthFunnel" in name:
                                        val *= 0.75
                                        
                                    shapes[name] = val
                                    
                            frame = {
                                "time": time_code,
                                "blendshapes": shapes
                            }
                            animations.append(frame)
                
                if response.HasField("status"):
                    if response.status.code != 0: # Assuming 0 is success
                         print(f"ACE Status: {response.status.message}")

            print(f"Received {len(animations)} frames of animation data from NVIDIA ACE.")
            return animations

        except grpc.RpcError as e:
            print(f"gRPC Error: {e.code()} - {e.details()}")
            return None
        except Exception as e:
            print(f"Error processing audio for ACE: {e}")
            return None

# Singleton instance - API key loaded from environment variable (NV_API_KEY)
ace_client = NvidiaACEClient()
