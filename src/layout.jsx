import { Tabs, TabsItem, Badge, Input, Button, Tooltip } from '@sunwu51/camel-ui';
import Watch from './tabs/Watch';
import ChangeBody from './tabs/ChangeBody';
import Execute from './tabs/Execute';
import ReplaceClass from './tabs/ReplaceClass';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { createContext, useContext, useEffect, useState } from 'react';
import LogContent from './logs/LogContent';
import toast, { Toaster } from 'react-hot-toast';


const WebSocketContext = createContext(null);

export const useWebSocketContext = () => {
    return useContext(WebSocketContext);
};
//'wss://echo.websocket.org
export default function Layout() {
    const defaultUrl = 'ws://' + window.location.hostname +':18000';
    const [socketUrl, setSocketUrl] = useState(defaultUrl);
    const [urlInput, setUrlInput] = useState(defaultUrl);
    const { sendMessage, lastMessage, readyState } = useWebSocket(socketUrl, {
        shouldReconnect: () => true,
        reconnectAttempts: 10,
        reconnectInterval: 10 * 1000,
    });
    const connectionStatus = {
        [ReadyState.CONNECTING]: 'Connecting',
        [ReadyState.OPEN]: 'Connected',
        [ReadyState.CLOSING]: 'Closing',
        [ReadyState.CLOSED]: 'Closed',
        [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
    }[readyState];
    const color = {
        [ReadyState.CONNECTING]: 'var(--w-blue-dark)',
        [ReadyState.OPEN]: 'var(--w-green-dark)',
        [ReadyState.CLOSING]: 'var(--w-red)',
        [ReadyState.CLOSED]: 'var(--w-red-dark)',
        [ReadyState.UNINSTANTIATED]: 'var(--w-yello-dark)',
    }[readyState];
    useEffect(()=>{
        document.title = 'swapper';
        fetch("/wsPort", {
            method: 'POST'
        }).then(res=>res.text()).then(port=>{
            if (parseInt(port) > 0) {
                setUrlInput('ws://' + window.location.hostname + ':' + port);
                setSocketUrl('ws://' + window.location.hostname + ':' + port);
            }
        })
    }, [])
    return <div>
        <div><Toaster toastOptions={{
            style: {
                boxShadow: 'var(--w-box-shadow)',
                border: '1px solid var(--w-black)',
                fontWeight: 'bold',
                color: 'var(--w-black)',
                backgroundColor: "var(--w-orange)",
                minWidth: '300px'
            },
        }} /></div>
        <div>
            <div className='m-2 flex items-end gap-3'>
                <div>
                    <Input value={urlInput} className='w-[550px]' defaultValue={defaultUrl} onChange={setUrlInput} aria-label='urlInput'></Input>
                </div>
                <div>
                    <Button onPress={()=>{
                        if (urlInput.startsWith("ws://") || urlInput.startsWith("wss://"))
                            setSocketUrl(urlInput)
                        else 
                            toast("❗ ws url error")
                    }}>Connect</Button>
                </div>
                <div>ws status: <Tooltip overlay={<span>{socketUrl}</span>}><Badge style={{ backgroundColor: color }}>{connectionStatus}</Badge></Tooltip></div>
            </div>
            <WebSocketContext.Provider value={{
                sendMessage,
                lastMessage,
                readyState,
            }}>
                <div className='flex flex-row p-2'>
                    <div>
                        <Tabs className='min-w-[700px] max-w-[800px] w-[50vw]' tabPanelClassName='min-h-[84vh]'>
                            <TabsItem title='Watch'>
                                <Watch />
                            </TabsItem>
                            <TabsItem title='Change'>
                                <ChangeBody />
                            </TabsItem>
                            <TabsItem title='Exec'>
                                <Execute />
                            </TabsItem>
                            <TabsItem title='Rep/Dec'>
                                <ReplaceClass />
                            </TabsItem>
                        </Tabs>
                    </div>
                    <div className='flex-1 min-w-[700px]'>
                        <LogContent />
                    </div>
                </div>
            </WebSocketContext.Provider>
        </div>

    </div>
}
