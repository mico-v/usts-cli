package jwgl

import (
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"math/big"
	"testing"
)

func TestEncryptPasswordRoundTrip(t *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 1024)
	if err != nil {
		t.Fatal(err)
	}
	modulus := base64.StdEncoding.EncodeToString(key.PublicKey.N.Bytes())
	exponent := base64.StdEncoding.EncodeToString(big.NewInt(int64(key.PublicKey.E)).Bytes())
	encrypted, err := encryptPassword("secret-password", modulus, exponent)
	if err != nil {
		t.Fatalf("encryptPassword(): %v", err)
	}
	ciphertext, err := base64.StdEncoding.DecodeString(encrypted)
	if err != nil {
		t.Fatal(err)
	}
	plain, err := rsa.DecryptPKCS1v15(rand.Reader, key, ciphertext)
	if err != nil {
		t.Fatalf("decrypt: %v", err)
	}
	if string(plain) != "secret-password" {
		t.Fatalf("plaintext = %q", plain)
	}
}
