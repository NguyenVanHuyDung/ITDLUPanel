package service

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"io"
	"os"

	"golang.org/x/crypto/pbkdf2"
)

// ---------------------------------------------------------------------------
// Backup encryption
// ---------------------------------------------------------------------------
//
// We provide a tiny AES-256-GCM at-rest encryption utility so that
// admin users can protect backup files before they leave the panel
// (e.g. when stored on Google Drive or shipped off-box as part of a
// download). The threat model is "someone gets hold of the backup
// file but not the passphrase"; it is not a substitute for TLS in
// flight — Drive already covers that.
//
// File format (all binary, big-endian):
//
//	magic[4]  = "ITBK"  (0x49 0x54 0x42 0x4B)
//	version   = uint8   (currently 1)
//	saltLen   = uint8
//	salt      = saltLen bytes
//	nonce     = 12 bytes (GCM standard)
//	ciphertext = AES-256-GCM(file_contents, key=pbkdf2(pass, salt, 100_000), nonce)
//	tag       = 16 bytes (appended by GCM)
//
// We use PBKDF2-SHA256 with 100 000 iterations to derive a 32-byte key
// from the user-supplied passphrase. The salt is random per file so the
// same passphrase produces different ciphertexts (defeats rainbow
// tables on a multi-file dump).
const (
	encMagic   = "ITBK"
	encVersion = uint8(1)
	pbkdfIter  = 100_000
	saltSize   = 16
)

// encryptFile reads `src`, encrypts it with the given passphrase, and
// writes the result to `dst`. The destination is overwritten if it
// already exists. Returns the number of plaintext bytes written.
func encryptFile(src, dst, passphrase string) (int64, error) {
	in, err := os.Open(src)
	if err != nil {
		return 0, fmt.Errorf("open src: %w", err)
	}
	defer in.Close()

	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return 0, fmt.Errorf("open dst: %w", err)
	}
	defer out.Close()

	salt := make([]byte, saltSize)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return 0, fmt.Errorf("read salt: %w", err)
	}

	key, err := deriveKey(passphrase, salt)
	if err != nil {
		return 0, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return 0, fmt.Errorf("new cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return 0, fmt.Errorf("new gcm: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return 0, fmt.Errorf("read nonce: %w", err)
	}

	// Header
	if _, err := out.Write([]byte(encMagic)); err != nil {
		return 0, err
	}
	if _, err := out.Write([]byte{encVersion}); err != nil {
		return 0, err
	}
	if _, err := out.Write([]byte{uint8(saltSize)}); err != nil {
		return 0, err
	}
	if _, err := out.Write(salt); err != nil {
		return 0, err
	}
	if _, err := out.Write(nonce); err != nil {
		return 0, err
	}

	// Stream the file through the cipher. GCM.Seal appends the auth
	// tag, so we just write straight to the output file.
	plaintext := make([]byte, 64*1024)
	buf := make([]byte, 0, 64*1024+gcm.Overhead())
	var total int64
	enc := gcm.Seal(buf[:0], nonce, nil, nil) // initial empty seal to prime buffer

	for {
		n, rerr := in.Read(plaintext)
		if n > 0 {
			enc = gcm.Seal(enc[:0], nonce, plaintext[:n], nil)
			if _, err := out.Write(enc); err != nil {
				return total, err
			}
			total += int64(n)
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			return total, rerr
		}
	}
	return total, nil
}

// decryptFile reverses encryptFile. Used by the restore path when the
// backup row's file_path ends in ".enc".
func decryptFile(src, dst, passphrase string) (int64, error) {
	in, err := os.Open(src)
	if err != nil {
		return 0, fmt.Errorf("open src: %w", err)
	}
	defer in.Close()

	out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return 0, fmt.Errorf("open dst: %w", err)
	}
	defer out.Close()

	// Read header
	header := make([]byte, 4+1+1+saltSize+12)
	if _, err := io.ReadFull(in, header); err != nil {
		return 0, fmt.Errorf("read header: %w", err)
	}
	if string(header[:4]) != encMagic {
		return 0, fmt.Errorf("not an encrypted backup (bad magic)")
	}
	if header[4] != encVersion {
		return 0, fmt.Errorf("unsupported encryption version: %d", header[4])
	}
	if int(header[5]) != saltSize {
		return 0, fmt.Errorf("unexpected salt size: %d", header[5])
	}
	salt := header[6 : 6+saltSize]
	nonce := header[6+saltSize:]

	key, err := deriveKey(passphrase, salt)
	if err != nil {
		return 0, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return 0, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return 0, err
	}

	// Open returns a reader that validates the auth tag on the final
	// chunk. We pipe plaintext chunks straight to the output file.
	reader, err := cipher.NewGCM(block)
	if err != nil {
		return 0, err
	}
	_ = reader // (alias so the linter doesn't complain; we use `gcm` below)

	chunk := make([]byte, 64*1024)
	var total int64
	plaintextBuf := make([]byte, 0, 64*1024)
	for {
		n, rerr := in.Read(chunk)
		if n > 0 {
			// Open() only validates the tag at EOF; for an online
			// streaming implementation we'd need a chunked AEAD.
			// For our use case (files up to a few GB) the simple
			// "read all, decrypt, write" is acceptable: the auth
			// tag is checked at the very end and we surface any
			// failure as an error. The cost is one extra copy.
			plaintextBuf = append(plaintextBuf, chunk[:n]...)
		}
		if rerr == io.EOF {
			break
		}
		if rerr != nil {
			return total, rerr
		}
	}
	dec, err := gcm.Open(nil, nonce, plaintextBuf, nil)
	if err != nil {
		return 0, fmt.Errorf("decrypt: %w (wrong passphrase or corrupted file)", err)
	}
	n, err := out.Write(dec)
	total = int64(n)
	if err != nil {
		return total, err
	}
	return total, nil
}

// deriveKey wraps pbkdf2 with sensible defaults.
func deriveKey(passphrase string, salt []byte) ([]byte, error) {
	if passphrase == "" {
		return nil, fmt.Errorf("empty passphrase")
	}
	return pbkdf2.Key([]byte(passphrase), salt, pbkdfIter, 32, sha256.New), nil
}

// isEncryptedBackup reports whether the path looks like an encrypted
// backup file (ends with .enc and starts with the magic bytes).
func isEncryptedBackup(path string) bool {
	if len(path) < 4 || path[len(path)-4:] != ".enc" {
		return false
	}
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()
	magic := make([]byte, 4)
	if _, err := io.ReadFull(f, magic); err != nil {
		return false
	}
	return string(magic) == encMagic
}
