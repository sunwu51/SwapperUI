import { WatchForm } from "./forms/WatchForm";
import { OuterWatchForm } from "./forms/OuterWatchForm";
import { TraceFrom } from "./forms/TraceForm";

export default function Watch() {
    return <div>
        <WatchForm />
        <OuterWatchForm />
        <TraceFrom />
    </div>
}
