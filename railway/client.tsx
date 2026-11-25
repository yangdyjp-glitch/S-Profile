import { createRoot } from "react-dom/client";
import Site from "../components/profile/site";
import { setOwnerSetupKey } from "../components/profile/ui";
import "../app/profile.css";

const key = new URLSearchParams(location.hash.slice(1)).get("setup");
if (key) {
  history.replaceState(null, "", location.pathname + location.search);
  setOwnerSetupKey(key);
}
createRoot(document.getElementById("root")!).render(<Site />);
