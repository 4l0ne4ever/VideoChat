import { Routes, Route } from "react-router-dom";
import "./App.css";
import Home from "./pages/Home";
import { SocketProvider } from "./providers/Socket";
import { ThemeProvider } from "./providers/Theme";

import Room from "./pages/Room";
import { PeerProvider } from "./providers/Peer";

function App() {
  return (
    <div className="App">
      <ThemeProvider>
        <SocketProvider>
          <PeerProvider>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/room/:roomId" element={<Room />} />
            </Routes>
          </PeerProvider>
        </SocketProvider>
      </ThemeProvider>
    </div>
  );
}

export default App;
