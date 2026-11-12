//go:build !windows

package sessionstore

import (
	"os"
	"syscall"
)

func secureSessionFile(info os.FileInfo) bool {
	if info.Mode().Perm()&0o077 != 0 {
		return false
	}
	stat, ok := info.Sys().(*syscall.Stat_t)
	return !ok || int(stat.Uid) == os.Geteuid()
}
