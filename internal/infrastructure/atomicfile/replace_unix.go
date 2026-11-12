//go:build !windows

package atomicfile

import "os"

func Replace(temp, destination string) error {
	return os.Rename(temp, destination)
}
