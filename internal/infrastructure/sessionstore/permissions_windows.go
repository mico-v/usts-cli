//go:build windows

package sessionstore

import "os"

func secureSessionFile(os.FileInfo) bool {
	return true
}
