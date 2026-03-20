package logger

import (
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/rs/zerolog"
	"gopkg.in/natefinch/lumberjack.v2"
)

// Log is the global application logger.
var Log zerolog.Logger

// Init initialises the global logger with console + rotating file output.
// logDir is the directory where panel.log will be written.
// debug enables debug-level logging; otherwise info-level is used.
func Init(logDir string, debug bool) {
	if err := os.MkdirAll(logDir, 0755); err != nil {
		panic("logger: failed to create log directory: " + err.Error())
	}

	consoleWriter := zerolog.ConsoleWriter{
		Out:        os.Stdout,
		TimeFormat: time.RFC3339,
	}

	fileWriter := &lumberjack.Logger{
		Filename:   filepath.Join(logDir, "panel.log"),
		MaxSize:    100, // megabytes
		MaxAge:     30,  // days
		MaxBackups: 5,
		Compress:   true,
	}

	multi := io.MultiWriter(consoleWriter, fileWriter)

	level := zerolog.InfoLevel
	if debug {
		level = zerolog.DebugLevel
	}

	zerolog.SetGlobalLevel(level)
	Log = zerolog.New(multi).With().Timestamp().Caller().Logger()
}

// Info starts a new info-level log event.
func Info() *zerolog.Event {
	return Log.Info()
}

// Error starts a new error-level log event.
func Error() *zerolog.Event {
	return Log.Error()
}

// Debug starts a new debug-level log event.
func Debug() *zerolog.Event {
	return Log.Debug()
}

// Warn starts a new warn-level log event.
func Warn() *zerolog.Event {
	return Log.Warn()
}
