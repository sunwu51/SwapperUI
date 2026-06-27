import { DecompileForm, FindSubclassesForm, ReplaceClassForm } from "./forms/ReplaceClassForm";

export default function ReplaceClass() {
    return <div>
        <ReplaceClassForm />
        <DecompileForm />
        <FindSubclassesForm />
    </div>
}
