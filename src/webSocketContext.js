import { createContext, useContext } from 'react';

export const ReadyState = {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
    UNINSTANTIATED: -1,
};

export const WebSocketContext = createContext(null);

export function useWebSocketContext() {
    return useContext(WebSocketContext);
}
