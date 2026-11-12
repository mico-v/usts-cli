//go:build !windows

package cli

func ensureVirtualTerminalOutput() error {
	return nil
}
