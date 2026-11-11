package config

import (
	"os"
	"path/filepath"
	"runtime"
)

func StateDirectory(values map[string]string) string {
	if value := values["USTS_STATE_DIR"]; value != "" {
		if absolute, err := filepath.Abs(value); err == nil {
			return absolute
		}
		return value
	}
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "windows":
		base := values["LOCALAPPDATA"]
		if base == "" {
			base = filepath.Join(home, "AppData", "Local")
		}
		return filepath.Join(base, "usts-cli")
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", "usts-cli")
	default:
		base := values["XDG_STATE_HOME"]
		if base == "" {
			base = filepath.Join(home, ".local", "state")
		}
		return filepath.Join(base, "usts-cli")
	}
}

func SessionFilePath(values map[string]string) string {
	return filepath.Join(StateDirectory(values), "session.json")
}

func ConfigDirectory(values map[string]string) string {
	if value := values["USTS_CONFIG_DIR"]; value != "" {
		if absolute, err := filepath.Abs(value); err == nil {
			return absolute
		}
		return value
	}
	home, _ := os.UserHomeDir()
	switch runtime.GOOS {
	case "windows":
		base := values["APPDATA"]
		if base == "" {
			base = filepath.Join(home, "AppData", "Roaming")
		}
		return filepath.Join(base, "usts-cli")
	case "darwin":
		return filepath.Join(home, "Library", "Application Support", "usts-cli")
	default:
		base := values["XDG_CONFIG_HOME"]
		if base == "" {
			base = filepath.Join(home, ".config")
		}
		return filepath.Join(base, "usts-cli")
	}
}

func EnvFilePath(values map[string]string) string {
	return filepath.Join(ConfigDirectory(values), ".env")
}

func LegacySessionFilePath(cwd string) string {
	return filepath.Join(cwd, ".session.json")
}
