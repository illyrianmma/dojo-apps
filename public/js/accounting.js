console.log("[ui] accounting.js loaded");
const $=s=>document.querySelector(s);
function money(n){ return (n||0).toLocaleString(undefined,{style:"currency",currency:"USD"}); }

async function runAccounting(){
  const from = $("#from")?.value || "";
  const to = $("#to")?.value || "";
  const q = new URLSearchParams(); if(from) q.set("from",from); if(to) q.set("to",to);
  const res = await fetch("/api/accounting/summary?"+q.toString());
  const z = await res.json();
  const out = document.getElementById("out"); if (!out) return;
  out.innerHTML = `
    <div class="card"><h2>Income</h2>
      <p>Taxable: <b>${money(z.incomeTaxable)}</b></p>
      <p>Non-Taxable: <b>${money(z.incomeNonTaxable)}</b></p>
      <p>Total: <b>${money(z.incomeTotal)}</b></p>
    </div>
    <div class="card"><h2>Expenses</h2>
      <p>Taxable: <b>${money(z.expenseTaxable)}</b></p>
      <p>Non-Taxable: <b>${money(z.expenseNonTaxable)}</b></p>
      <p>Total: <b>${money(z.expenseTotal)}</b></p>
    </div>
    <div class="card"><h2>Net</h2>
      <p><b>${money(z.net)}</b></p>
    </div>`;
}

document.getElementById("run")?.addEventListener("click", runAccounting);
document.getElementById("clear")?.addEventListener("click", ()=>{ $("#from").value=""; $("#to").value=""; runAccounting(); });

runAccounting();