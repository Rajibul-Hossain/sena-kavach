import os
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

AES_BLOCK_SIZE = 16

def pkcs7_pad(data: bytes) -> bytes:
    padding_len = AES_BLOCK_SIZE - (len(data) % AES_BLOCK_SIZE)
    return data + bytes([padding_len] * padding_len)

def encrypt_payload(payload: bytes, key: bytes) -> tuple[bytes, bytes]:
    if len(key) != 16:
        raise ValueError("AES-128 requires a 16-byte key.")
        
    iv = os.urandom(AES_BLOCK_SIZE)
    padded_payload = pkcs7_pad(payload)
    
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    ciphertext = encryptor.update(padded_payload) + encryptor.finalize()
    
    return iv, ciphertext