// Message Encryption Service
import { supabase } from '../supabase/client';
import { UserEncryptionKey } from '../../types/communication';

export class MessageEncryptionService {
  private static instance: MessageEncryptionService;
  private keyCache = new Map<string, CryptoKey>();

  constructor() {}

  static getInstance(): MessageEncryptionService {
    if (!MessageEncryptionService.instance) {
      MessageEncryptionService.instance = new MessageEncryptionService();
    }
    return MessageEncryptionService.instance;
  }

  // Generate RSA key pair for a user
  async generateKeyPair(userId: string): Promise<{ publicKey: string; privateKey: string }> {
    try {
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        },
        true, // extractable
        ['encrypt', 'decrypt']
      );

      const publicKeyData = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
      const privateKeyData = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

      const publicKeyPem = this.arrayBufferToPem(publicKeyData, 'PUBLIC KEY');
      const privateKeyPem = this.arrayBufferToPem(privateKeyData, 'PRIVATE KEY');

      // Store public key in database
      await this.storePublicKey(userId, publicKeyPem);

      // Store private key locally (in a real app, use secure storage)
      localStorage.setItem(`private_key_${userId}`, privateKeyPem);

      return {
        publicKey: publicKeyPem,
        privateKey: privateKeyPem
      };
    } catch (error) {
      console.error('Error generating key pair:', error);
      throw error;
    }
  }

  // Store public key in database
  private async storePublicKey(userId: string, publicKeyPem: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_encryption_keys')
        .upsert({
          user_id: userId,
          public_key: publicKeyPem,
          key_type: 'RSA',
          is_active: true,
          created_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,key_type'
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error storing public key:', error);
      throw error;
    }
  }

  // Get user's public key
  async getPublicKey(userId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('user_encryption_keys')
        .select('public_key')
        .eq('user_id', userId)
        .eq('key_type', 'RSA')
        .eq('is_active', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No key found - generate one
          const keyPair = await this.generateKeyPair(userId);
          return keyPair.publicKey;
        }
        throw error;
      }

      return data.public_key;
    } catch (error) {
      console.error('Error getting public key:', error);
      return null;
    }
  }

  // Get user's private key from local storage
  private getPrivateKey(userId: string): string | null {
    return localStorage.getItem(`private_key_${userId}`);
  }

  // Convert ArrayBuffer to PEM format
  private arrayBufferToPem(buffer: ArrayBuffer, type: string): string {
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const formattedBase64 = base64.match(/.{1,64}/g)?.join('\n') || base64;
    return `-----BEGIN ${type}-----\n${formattedBase64}\n-----END ${type}-----`;
  }

  // Convert PEM to ArrayBuffer
  private pemToArrayBuffer(pem: string): ArrayBuffer {
    const base64 = pem
      .replace(/-----BEGIN.*-----/, '')
      .replace(/-----END.*-----/, '')
      .replace(/\s/g, '');
    
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return bytes.buffer;
  }

  // Import a crypto key from PEM
  private async importKey(keyPem: string, isPrivate: boolean): Promise<CryptoKey> {
    const cacheKey = `${isPrivate ? 'private' : 'public'}_${keyPem.substring(0, 50)}`;
    
    if (this.keyCache.has(cacheKey)) {
      return this.keyCache.get(cacheKey)!;
    }

    try {
      const keyData = this.pemToArrayBuffer(keyPem);
      const key = await window.crypto.subtle.importKey(
        isPrivate ? 'pkcs8' : 'spki',
        keyData,
        {
          name: 'RSA-OAEP',
          hash: 'SHA-256',
        },
        false,
        isPrivate ? ['decrypt'] : ['encrypt']
      );

      this.keyCache.set(cacheKey, key);
      return key;
    } catch (error) {
      console.error('Error importing key:', error);
      throw error;
    }
  }

  // Encrypt a message for a specific recipient
  async encryptMessage(message: string, recipientUserId: string): Promise<string | null> {
    try {
      const publicKeyPem = await this.getPublicKey(recipientUserId);
      if (!publicKeyPem) {
        console.error('No public key found for recipient');
        return null;
      }

      const publicKey = await this.importKey(publicKeyPem, false);
      const encoder = new TextEncoder();
      const data = encoder.encode(message);

      const encrypted = await window.crypto.subtle.encrypt(
        {
          name: 'RSA-OAEP',
        },
        publicKey,
        data
      );

      // Convert to base64 for storage
      return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
    } catch (error) {
      console.error('Error encrypting message:', error);
      return null;
    }
  }

  // Decrypt a message using user's private key
  async decryptMessage(encryptedMessage: string, userId: string): Promise<string | null> {
    try {
      const privateKeyPem = this.getPrivateKey(userId);
      if (!privateKeyPem) {
        console.error('No private key found for user');
        return null;
      }

      const privateKey = await this.importKey(privateKeyPem, true);
      
      // Convert from base64
      const encryptedData = new Uint8Array(
        atob(encryptedMessage).split('').map(char => char.charCodeAt(0))
      );

      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: 'RSA-OAEP',
        },
        privateKey,
        encryptedData
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('Error decrypting message:', error);
      return null;
    }
  }

  // Encrypt message for multiple recipients (group chat)
  async encryptMessageForGroup(
    message: string, 
    recipientUserIds: string[]
  ): Promise<Array<{ userId: string; encryptedMessage: string }>> {
    const results: Array<{ userId: string; encryptedMessage: string }> = [];

    for (const userId of recipientUserIds) {
      const encrypted = await this.encryptMessage(message, userId);
      if (encrypted) {
        results.push({ userId, encryptedMessage: encrypted });
      }
    }

    return results;
  }

  // Generate AES key for symmetric encryption (for large messages or files)
  async generateAESKey(): Promise<CryptoKey> {
    return await window.crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  // Encrypt large content with AES
  async encryptWithAES(content: string, key: CryptoKey): Promise<{
    encryptedContent: string;
    iv: string;
  }> {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(content);
      const iv = window.crypto.getRandomValues(new Uint8Array(12));

      const encrypted = await window.crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        key,
        data
      );

      return {
        encryptedContent: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        iv: btoa(String.fromCharCode(...iv))
      };
    } catch (error) {
      console.error('Error encrypting with AES:', error);
      throw error;
    }
  }

  // Decrypt content with AES
  async decryptWithAES(
    encryptedContent: string, 
    ivBase64: string, 
    key: CryptoKey
  ): Promise<string> {
    try {
      const encryptedData = new Uint8Array(
        atob(encryptedContent).split('').map(char => char.charCodeAt(0))
      );
      const iv = new Uint8Array(
        atob(ivBase64).split('').map(char => char.charCodeAt(0))
      );

      const decrypted = await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
        },
        key,
        encryptedData
      );

      const decoder = new TextDecoder();
      return decoder.decode(decrypted);
    } catch (error) {
      console.error('Error decrypting with AES:', error);
      throw error;
    }
  }

  // Hybrid encryption: Use AES for content, RSA for AES key
  async hybridEncrypt(
    message: string, 
    recipientUserId: string
  ): Promise<{
    encryptedMessage: string;
    encryptedAESKey: string;
    iv: string;
  } | null> {
    try {
      // Generate AES key
      const aesKey = await this.generateAESKey();
      
      // Encrypt message with AES
      const { encryptedContent, iv } = await this.encryptWithAES(message, aesKey);
      
      // Export AES key
      const aesKeyData = await window.crypto.subtle.exportKey('raw', aesKey);
      const aesKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(aesKeyData)));
      
      // Encrypt AES key with recipient's RSA public key
      const encryptedAESKey = await this.encryptMessage(aesKeyBase64, recipientUserId);
      
      if (!encryptedAESKey) {
        return null;
      }

      return {
        encryptedMessage: encryptedContent,
        encryptedAESKey,
        iv
      };
    } catch (error) {
      console.error('Error in hybrid encryption:', error);
      return null;
    }
  }

  // Hybrid decryption
  async hybridDecrypt(
    encryptedMessage: string,
    encryptedAESKey: string,
    iv: string,
    userId: string
  ): Promise<string | null> {
    try {
      // Decrypt AES key with user's private key
      const aesKeyBase64 = await this.decryptMessage(encryptedAESKey, userId);
      if (!aesKeyBase64) {
        return null;
      }

      // Import AES key
      const aesKeyData = new Uint8Array(
        atob(aesKeyBase64).split('').map(char => char.charCodeAt(0))
      );
      const aesKey = await window.crypto.subtle.importKey(
        'raw',
        aesKeyData,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      // Decrypt message with AES key
      return await this.decryptWithAES(encryptedMessage, iv, aesKey);
    } catch (error) {
      console.error('Error in hybrid decryption:', error);
      return null;
    }
  }

  // Key management utilities
  async rotateKeys(userId: string): Promise<boolean> {
    try {
      // Mark old keys as inactive
      await supabase
        .from('user_encryption_keys')
        .update({ is_active: false })
        .eq('user_id', userId);

      // Generate new key pair
      await this.generateKeyPair(userId);
      
      return true;
    } catch (error) {
      console.error('Error rotating keys:', error);
      return false;
    }
  }

  async deleteUserKeys(userId: string): Promise<boolean> {
    try {
      // Remove from database
      await supabase
        .from('user_encryption_keys')
        .delete()
        .eq('user_id', userId);

      // Remove from local storage
      localStorage.removeItem(`private_key_${userId}`);

      // Clear from cache
      this.keyCache.clear();
      
      return true;
    } catch (error) {
      console.error('Error deleting user keys:', error);
      return false;
    }
  }

  // Check if encryption is available
  isEncryptionAvailable(): boolean {
    return (
      typeof window !== 'undefined' &&
      window.crypto &&
      window.crypto.subtle &&
      typeof window.crypto.subtle.generateKey === 'function'
    );
  }

  // Key verification
  async verifyKeyPair(userId: string): Promise<boolean> {
    try {
      const publicKeyPem = await this.getPublicKey(userId);
      const privateKeyPem = this.getPrivateKey(userId);

      if (!publicKeyPem || !privateKeyPem) {
        return false;
      }

      // Test encryption/decryption with a known message
      const testMessage = 'test_message_' + Date.now();
      const encrypted = await this.encryptMessage(testMessage, userId);
      
      if (!encrypted) {
        return false;
      }

      const decrypted = await this.decryptMessage(encrypted, userId);
      return decrypted === testMessage;
    } catch (error) {
      console.error('Error verifying key pair:', error);
      return false;
    }
  }
}

// React hook for encryption functionality
export function useMessageEncryption() {
  const encryptionService = MessageEncryptionService.getInstance();
  
  const [isSupported, setIsSupported] = React.useState(false);
  const [isInitialized, setIsInitialized] = React.useState(false);

  React.useEffect(() => {
    setIsSupported(encryptionService.isEncryptionAvailable());
  }, []);

  const initializeEncryption = async (userId: string) => {
    try {
      const hasValidKeys = await encryptionService.verifyKeyPair(userId);
      
      if (!hasValidKeys) {
        await encryptionService.generateKeyPair(userId);
      }
      
      setIsInitialized(true);
      return true;
    } catch (error) {
      console.error('Failed to initialize encryption:', error);
      return false;
    }
  };

  const encryptMessage = async (message: string, recipientId: string) => {
    if (!isSupported || !isInitialized) {
      return null;
    }
    
    return await encryptionService.encryptMessage(message, recipientId);
  };

  const decryptMessage = async (encryptedMessage: string, userId: string) => {
    if (!isSupported || !isInitialized) {
      return null;
    }
    
    return await encryptionService.decryptMessage(encryptedMessage, userId);
  };

  const hybridEncrypt = async (message: string, recipientId: string) => {
    if (!isSupported || !isInitialized) {
      return null;
    }
    
    return await encryptionService.hybridEncrypt(message, recipientId);
  };

  const hybridDecrypt = async (
    encryptedMessage: string,
    encryptedAESKey: string,
    iv: string,
    userId: string
  ) => {
    if (!isSupported || !isInitialized) {
      return null;
    }
    
    return await encryptionService.hybridDecrypt(
      encryptedMessage,
      encryptedAESKey,
      iv,
      userId
    );
  };

  return {
    isSupported,
    isInitialized,
    initializeEncryption,
    encryptMessage,
    decryptMessage,
    hybridEncrypt,
    hybridDecrypt
  };
}

export default MessageEncryptionService;