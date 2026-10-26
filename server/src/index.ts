import { createApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 4000);
const { server } = await createApp();
server.listen(PORT, () => console.log(`API + Socket.io (/board) listening on :${PORT}`));
