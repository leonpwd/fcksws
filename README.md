# Fcksws

**Lightweight QR code sharing webapp - Real-time transmission through websockets**

## Quick Start

### Docker (Recommended)

```bash
docker run -p 3000:3000 ghcr.io/leonpwd/fcksws:latest
```

### Local Development

```bash
bun install && bun run dev
```

## Features

- QR code sharing in real time
- Dynamic rooms - Scanner creates room, others join
- Minimalistic - 101kB Docker image

> Caution : The app needs to be set up behind a reverse proxy with SSL, otherwise the browsers won't allow the camera to open.

<p align="center">
	<img src="https://raw.githubusercontent.com/catppuccin/catppuccin/main/assets/footers/gray0_ctp_on_line.svg?sanitize=true" />
</p>

<p align="center">
	<a href="https://github.com/leonpwd/fcksws/blob/main/LICENSE"><img src="https://img.shields.io/static/v1.svg?style=for-the-badge&label=License&message=UNLICENSE&logoColor=d9e0ee&colorA=363a4f&colorB=b7bdf8"/></a>
</p>
