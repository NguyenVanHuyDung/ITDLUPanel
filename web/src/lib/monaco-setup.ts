import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';

import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_: string, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  },
};

loader.config({ monaco });

// Register nginx language for syntax highlighting
monaco.languages.register({ id: 'nginx' });
monaco.languages.setMonarchTokensProvider('nginx', {
  defaultToken: '',
  tokenPostfix: '.nginx',
  keywords: [
    'server', 'location', 'upstream', 'http', 'events', 'stream', 'mail', 'map', 'geo', 'types',
    'if', 'set', 'rewrite', 'return', 'break', 'proxy_pass', 'fastcgi_pass', 'uwsgi_pass',
    'include', 'root', 'index', 'try_files', 'error_page', 'access_log', 'error_log',
    'listen', 'server_name', 'ssl_certificate', 'ssl_certificate_key',
    'worker_processes', 'worker_connections', 'sendfile', 'keepalive_timeout',
    'gzip', 'gzip_types', 'gzip_comp_level', 'gzip_min_length',
    'client_max_body_size', 'client_body_buffer_size', 'proxy_set_header',
    'proxy_read_timeout', 'proxy_connect_timeout', 'proxy_send_timeout',
    'add_header', 'expires', 'log_format', 'deny', 'allow', 'auth_basic',
    'autoindex', 'charset', 'default_type', 'resolver', 'limit_req', 'limit_conn',
    'ssl_protocols', 'ssl_ciphers', 'ssl_session_cache', 'ssl_session_timeout',
    'proxy_cache', 'proxy_cache_valid', 'proxy_cache_path', 'proxy_buffering',
    'fastcgi_param', 'fastcgi_index', 'fastcgi_buffer_size', 'fastcgi_buffers',
  ],
  operators: ['=', '~', '~*', '^~', '!='],
  symbols: /[=><!~?:&|+\-*\/\^%]+/,
  tokenizer: {
    root: [
      [/#.*$/, 'comment'],
      [/\b(on|off|yes|no|true|false)\b/, 'keyword.constant'],
      [/\b\d+[kKmMgG]?\b/, 'number'],
      [/\$[a-zA-Z_]\w*/, 'variable'],
      [/"([^"\\]|\\.)*"/, 'string'],
      [/'([^'\\]|\\.)*'/, 'string'],
      [/[a-zA-Z_][\w_]*/, {
        cases: {
          '@keywords': 'keyword',
          '@default': 'identifier',
        },
      }],
      [/[{}()\[\]]/, '@brackets'],
      [/;/, 'delimiter'],
      [/@symbols/, {
        cases: {
          '@operators': 'operator',
          '@default': '',
        },
      }],
    ],
  },
});

export default monaco;
