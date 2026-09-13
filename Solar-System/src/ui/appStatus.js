import { hasAnime, stopAnime, runAnime } from "./animationLibrary.js";

export function showLoadingScreen(show, msg = "Loading…") {
  let div = document.getElementById("loadingScreen");
  if (show) {
    if (!div) {
      div = document.createElement("div");
      div.id = "loadingScreen";
      // Apply styles directly - ensure opacity is 1 initially
      Object.assign(div.style, {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        zIndex: 2000,
        background: "rgba(0,0,0,.8)",
        color: "#fff",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        fontSize: "24px",
        fontFamily: "Arial, sans-serif",
        opacity: 1, // Start fully visible
      });
      document.body.appendChild(div);
    }
    div.textContent = msg;
    div.style.display = "flex";
    div.style.opacity = 1; // Ensure opacity is reset if shown again
  } else if (div) {
    // Use Anime.js to fade out if available; otherwise hide immediately
    if (hasAnime()) {
      try {
        stopAnime(div);
      } catch {}
      runAnime({
        targets: div,
        opacity: [1, 0],
        duration: 500,
        easing: "easeOutQuad",
        complete: () => {
          div.style.display = "none";
        },
      });
    } else {
      div.style.display = "none";
    }
  }
}
export function showErrorMessage(msg) {
  let div = document.getElementById("errorOverlay");
  if (!div) {
    div = document.createElement("div");
    div.id = "errorOverlay";
    Object.assign(div.style, {
      position: "fixed",
      top: "10px",
      left: "10px",
      right: "10px",
      zIndex: 2001,
      background: "rgba(200,0,0,.9)",
      color: "#fff",
      padding: "15px",
      border: "1px solid darkred",
      borderRadius: "5px",
      fontFamily: "Arial,sans-serif",
      fontSize: "16px",
      textAlign: "center",
    });
    document.body.appendChild(div);
  }
  // Safely construct message content without innerHTML
  div.textContent = "";
  const strong = document.createElement("strong");
  strong.textContent = "Initialization Error:";
  div.appendChild(strong);
  div.appendChild(document.createTextNode(` ${String(msg || "")}`));
  div.appendChild(document.createElement("br"));
  div.appendChild(document.createTextNode("Check console (F12) for details."));
  div.style.display = "block";
}

export function clearErrorMessage() {
  const div = document.getElementById("errorOverlay");
  if (!div) return;
  div.style.display = "none";
}
