import React, { useMemo } from "react";
import { io, Socket } from "socket.io-client";

interface SocketContextType {
  socket: Socket;
}

const SocketContext = React.createContext<SocketContextType | undefined>(
  undefined
);

export const useSocket = () => {
  const context = React.useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used within a SocketProvider");
  }
  return context;
};

export const SocketProvider = (props: React.PropsWithChildren<{}>) => {
  const socket = useMemo(() => io("http://localhost:8001"), []);
  return (
    <SocketContext.Provider value={{ socket }}>
      {props.children}
    </SocketContext.Provider>
  );
};
