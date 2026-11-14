import socketserver, sys, os

OUT = sys.argv[2] if len(sys.argv) > 2 else 'mail.log'


class Handler(socketserver.StreamRequestHandler):
    def send(self, line):
        self.wfile.write((line + '\r\n').encode())

    def handle(self):
        self.send('220 sink ready')
        in_data = False
        buf = []
        while True:
            raw = self.rfile.readline()
            if not raw:
                return
            line = raw.decode(errors='replace').rstrip('\r\n')
            if in_data:
                if line == '.':
                    in_data = False
                    with open(OUT, 'a') as f:
                        f.write('\n'.join(buf) + '\n=====END=====\n')
                    buf = []
                    self.send('250 queued')
                else:
                    buf.append(line)
                continue
            cmd = line.split(' ')[0].upper()
            if cmd in ('EHLO', 'HELO'):
                self.wfile.write(b'250-sink\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n')
            elif cmd == 'AUTH':
                self.send('235 ok')
            elif cmd == 'DATA':
                in_data = True
                self.send('354 go')
            elif cmd == 'QUIT':
                self.send('221 bye')
                return
            else:
                self.send('250 ok')


socketserver.ThreadingTCPServer.allow_reuse_address = True
socketserver.ThreadingTCPServer(('127.0.0.1', int(sys.argv[1])), Handler).serve_forever()
