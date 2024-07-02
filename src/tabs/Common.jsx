import { Details } from "@sunwu51/camel-ui";

export function TabPanelItem(props) {
    return <div className="p-2 border-b-2">
        <Details title={props.title} defaultSelected={props.open ?? false}
            titleClassName=" font-bold text-[var(--w-blue-dark)]">
            {props.children}
        </Details>
    </div>
}


export function genTraceId() {
    var s = [];
    var hexDigits = "0123456789abcdef";
    for (var i = 0; i < 4; i++) {
        s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
    }
    var id = s.join("");
    return id;
}