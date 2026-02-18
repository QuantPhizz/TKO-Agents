const form = document.getElementById("auditForm");
const statusEl = document.getElementById("status");
const submitBtn = document.getElementById("submitBtn");

const results = document.getElementById("results");
const problems = document.getElementById("problems");
const quickWins = document.getElementById("quickWins");
const tier = document.getElementById("tier");
const nextAction = document.getElementById("nextAction");

const bookLink = document.getElementById("bookLink");
const buyLink = document.getElementById("buyLink");

let currentLeadId = null;

function trackCtaClick() {
  if (!currentLeadId) return;

  fetch("/.netlify/functions/lead-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      leadId: currentLeadId,
      event: "cta_clicked"
    })
  }).catch(() => {});
}

bookLink.addEventListener("click", trackCtaClick);
buyLink.addEventListener("click", trackCtaClick);

// TODO: Replace with your real links (Calendly + Stripe)
const LINKS = {
  book: "https://calendly.com/",
  ignite: "https://buy.stripe.com/",
  accelerate: "https://buy.stripe.com/",
  dominate: "https://calendly.com/"
};

function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function setLoading(isLoading) {
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? "Running..." : "Run Audit";
}

function fillList(el, items) {
  el.innerHTML = "";
  (items || []).forEach((x) => {
    const li = document.createElement("li");

    // Supports either string items OR objects like { description, impact }
    if (x && typeof x === "object") {
      const desc = x.description ? String(x.description) : JSON.stringify(x);
      const impact = x.impact ? String(x.impact) : "";

      const strong = document.createElement("strong");
      strong.textContent = desc;

      li.appendChild(strong);

      if (impact) {
        const small = document.createElement("div");
        small.className = "muted";
        small.textContent = impact;
        li.appendChild(small);
      }
    } else {
      li.textContent = String(x);
    }

    el.appendChild(li);
  });
}

function pickCta(recommendedTier) {
  const t = (recommendedTier || "").toLowerCase();

  bookLink.href = LINKS.book;

  if (t.includes("ignite")) buyLink.href = LINKS.ignite;
  else if (t.includes("accelerate")) buyLink.href = LINKS.accelerate;
  else {
    // Dominate or unknown -> call
    buyLink.href = LINKS.dominate;
    buyLink.textContent = "Request White-Glove";
    return;
  }
  buyLink.textContent = "Start Now";
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setStatus("");
  results.classList.add("hidden");

  const data = Object.fromEntries(new FormData(form).entries());
  const payload = {
    agentId: "audit.v1",
    input: {
      businessType: data.businessType,
      hasWebsite: data.hasWebsite,
      monthlyLeads: Number(data.monthlyLeads),
      bookingMethod: data.bookingMethod,
      biggestPain: data.biggestPain
    }
  };

  try {
    setLoading(true);
    setStatus("Calling audit agent…");

    const res = await fetch("/.netlify/functions/run-audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const text = await res.text();
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

const json = JSON.parse(text);
currentLeadId = json.leadId;
console.log("Lead ID:", currentLeadId);
const out = json.data;

if (!json.ok) {
  throw new Error(json.error || "audit_failed");
}

fillList(problems, out.problems);
fillList(quickWins, out.quickWins);
tier.textContent = out.recommendedTier || "—";
nextAction.textContent = out.nextAction || "—";

pickCta(out.recommendedTier);

    results.classList.remove("hidden"); 
if (currentLeadId) {
  fetch("/.netlify/functions/lead-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      leadId: currentLeadId,
      event: "audit_viewed"
    })
  }).catch(() => {});
}

    setStatus("Done.");
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message || err}`);
  } finally {
    setLoading(false);
  }
});

