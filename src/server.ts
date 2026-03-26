import { Hono } from "hono";
import { serveStatic } from "hono/bun";

const app = new Hono();

// Simple CORS headers
app.use("*", async (c, next) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  c.header("Access-Control-Allow-Headers", "Content-Type");
  if (c.req.method === "OPTIONS") {
    return c.text("OK");
  }
  await next();
});

// Security headers
app.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("X-XSS-Protection", "1; mode=block");
  await next();
});

// Simple rate limiting store
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();
// Simple rate limiting
app.use("/api/*", async (c, next) => {
  const clientIP = c.req.header("x-forwarded-for") || 
                   c.req.header("x-real-ip") || 
                   "unknown";
  
  const now = Date.now();
  const RATE_LIMIT_WINDOW = 60000; // 1 minute
  const RATE_LIMIT_MAX_REQUESTS = 100;
  
  // Clean old entries
  for (const [ip, data] of rateLimitStore.entries()) {
    if (data.resetTime < now) {
      rateLimitStore.delete(ip);
    }
  }
  
  const clientData = rateLimitStore.get(clientIP) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };
  
  if (clientData.count >= RATE_LIMIT_MAX_REQUESTS && clientData.resetTime > now) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }
  
  clientData.count++;
  rateLimitStore.set(clientIP, clientData);
  
  await next();
});

// Security: Input validation functions
function sanitizeRoomName(name: string): string {
  if (!name || typeof name !== "string") return "Room";
  // Remove dangerous characters, limit length
  return name.replace(/[<>\"'&]/g, "").substring(0, 50).trim() || "Room";
}

function sanitizeRoomId(id: string): string {
  if (!id || typeof id !== "string") return "";
  // Only allow alphanumeric and hyphens, limit length
  return id.replace(/[^a-zA-Z0-9-]/g, "").substring(0, 20);
}

// Store active connections per room with metadata
const rooms = new Map<string, { 
  name: string, 
  connections: Set<any>, 
  createdAt: number,
  lastActivity: number 
}>();

// Security: Room cleanup (prevent memory leaks)
setInterval(() => {
  const now = Date.now();
  const ROOM_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const [roomId, room] of rooms.entries()) {
    if (room.connections.size === 0 && (now - room.lastActivity) > ROOM_TIMEOUT) {
      rooms.delete(roomId);
      console.log(`Cleaned up inactive room: ${roomId}`);
    }
  }
}, 60 * 60 * 1000); // Run every hour

// Serve static files with security
app.use("/*", serveStatic({ 
  root: "./src/public"
}));

// Main route
app.get("/", (c) => c.redirect("/index.html"));

// API: Get active rooms with input validation
app.get("/api/rooms", (c) => {
  try {
    const activeRooms = Array.from(rooms.entries())
      .filter(([_, data]) => data.connections.size > 0) // Only active rooms
      .map(([id, data]) => ({
        id: sanitizeRoomId(id),
        name: sanitizeRoomName(data.name),
        members: Math.min(data.connections.size, 999), // Cap displayed number
        createdAt: data.createdAt
      }))
      .slice(0, 50); // Limit number of rooms returned
    
    return c.json(activeRooms);
  } catch (error) {
    console.error("Error fetching rooms:", error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// Security: WebSocket connection limits per IP
const wsConnectionLimits = new Map<string, number>();
const MAX_WS_CONNECTIONS_PER_IP = 10;

// WebSocket upgrade with comprehensive security
const server = Bun.serve({
  port: Number(process.env.PORT) || 3000,
  fetch(req, server) {
    const url = new URL(req.url);
    
    // WebSocket endpoint with security checks
    if (url.pathname === "/ws") {
      // Security: Input validation
      const roomId = sanitizeRoomId(url.searchParams.get("room") || "");
      const roomName = sanitizeRoomName(url.searchParams.get("name") || "Room");
      const isScanner = url.searchParams.get("scanner") === "true";
      
      // Security: Validate room ID
      if (!roomId || roomId.length < 1) {
        return new Response("Invalid room ID", { status: 400 });
      }
      
      // Security: Connection limit per IP
      const clientIP = req.headers.get("x-forwarded-for") || 
                       req.headers.get("x-real-ip") || 
                       "unknown";
      
      const currentConnections = wsConnectionLimits.get(clientIP) || 0;
      if (currentConnections >= MAX_WS_CONNECTIONS_PER_IP) {
        return new Response("Too many connections", { status: 429 });
      }
      
      const upgraded = server.upgrade(req, { 
        data: { roomId, roomName, isScanner, clientIP } 
      });
      if (upgraded) return undefined;
    }
    
    // Regular HTTP requests
    return app.fetch(req, server);
  },
  websocket: {
    open(ws) {
      const { roomId, roomName, isScanner, clientIP } = ws.data;
      
      // Security: Track connections per IP
      wsConnectionLimits.set(clientIP, (wsConnectionLimits.get(clientIP) || 0) + 1);
      
      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          name: roomName,
          connections: new Set(),
          createdAt: Date.now(),
          lastActivity: Date.now()
        });
        console.log(`Room created: ${roomName} (${roomId})`);
      }
      
      const room = rooms.get(roomId)!;
      room.connections.add(ws);
      room.lastActivity = Date.now();
      
      console.log(`Client ${isScanner ? 'scanner' : 'receiver'} joined room "${room.name}" (${roomId}). Total: ${room.connections.size}`);
    },
    message(ws, message) {
      try {
        const { roomId } = ws.data;
        const room = rooms.get(roomId);
        
        if (room) {
          room.lastActivity = Date.now();
          
          // Security: Message size limit
          if (message.length > 10000) { // 10KB limit
            ws.send(JSON.stringify({ error: "Message too large" }));
            return;
          }
          
          // Security: Message rate limiting (simple)
          const now = Date.now();
          ws.lastMessageTime = ws.lastMessageTime || 0;
          if (now - ws.lastMessageTime < 100) { // 100ms minimum between messages
            return;
          }
          ws.lastMessageTime = now;
          
          // Broadcast to all clients in the same room except sender
          room.connections.forEach((client) => {
            if (client !== ws && client.readyState === 1) {
              try {
                client.send(message);
              } catch (err) {
                console.error("Error sending message to client:", err);
                room.connections.delete(client);
              }
            }
          });
        }
      } catch (error) {
        console.error("WebSocket message error:", error);
      }
    },
    close(ws) {
      const { roomId, roomName, clientIP } = ws.data;
      
      // Security: Cleanup connection count
      const currentCount = wsConnectionLimits.get(clientIP) || 0;
      if (currentCount <= 1) {
        wsConnectionLimits.delete(clientIP);
      } else {
        wsConnectionLimits.set(clientIP, currentCount - 1);
      }
      
      const room = rooms.get(roomId);
      
      if (room) {
        room.connections.delete(ws);
        room.lastActivity = Date.now();
        console.log(`Client left room "${roomName}" (${roomId}). Remaining: ${room.connections.size}`);
        
        // Delete room if empty (with delay)
        if (room.connections.size === 0) {
          setTimeout(() => {
            const currentRoom = rooms.get(roomId);
            if (currentRoom && currentRoom.connections.size === 0) {
              rooms.delete(roomId);
              console.log(`Room "${roomName}" (${roomId}) deleted (empty)`);
            }
          }, 5000); // 5 second delay before cleanup
        }
      }
    },
  },
});

console.log(`🚀 Server running at http://localhost:${server.port}`);
console.log(`🔒 Security: Rate limiting, input validation, and headers enabled`);
