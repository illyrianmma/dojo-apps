console.log("[ui] leads.js loaded");
const $ = s => document.querySelector(s);
const api = (p,opt)=>fetch(p,opt).then(r=>r.ok?r.json():r.json().then(e=>Promise.reject(e)));
let editingId = null;

async function loadLeads(){
  const rows = await api("/api/leads");
  const tb = document.querySelector("#leadsTable tbody"); if (!tb) return;
  tb.innerHTML = "";
  rows.forEach(l=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${l.name||""}</td>
      <td>${l.phone||""}</td>
      <td>${l.interested_program||""}</td>
      <td>${l.follow_up_date||""}</td>
      <td>
        <button class="btn" data-act="edit" data-id="${l.id}">Edit</button>
        <button class="btn btn-danger" data-act="del" data-id="${l.id}">Delete</button>
        <button class="btn btn-primary" data-act="convert" data-id="${l.id}">Convert → Student</button>
      </td>`;
    tb.appendChild(tr);
  });
}

document.addEventListener("click", async (e)=>{
  const b = e.target.closest("button"); if (!b) return;
  const id = b.dataset.id, act = b.dataset.act;

  if (document.getElementById("leadsTable") && id && act) {
    try{
      if (act==="edit"){
        const l = await api("/api/leads/"+id); editingId = id;
        ["name","phone","email","interested_program","follow_up_date"].forEach(k=>{
          const el=document.getElementById(k); if (el) el.value = l[k]||"";
        });
        const st = document.getElementById("status"); if (st) st.textContent = "Editing #"+id;
        const saveBtn = document.getElementById("saveLead"); if (saveBtn) saveBtn.textContent = "Save Lead";
      } else if (act==="del"){
        await api("/api/leads/"+id, { method:"DELETE" }); loadLeads();
      } else if (act==="convert"){
        await api(`/api/leads/${id}/convert`, { method:"POST" });
        loadLeads(); alert("Lead converted to student.");
      }
    }catch(err){ alert(err.error || "Action failed"); }
  }
});

const saveLeadBtn = document.getElementById("saveLead");
if (saveLeadBtn){
  saveLeadBtn.onclick = async ()=>{
    const body = {
      name: $("#name")?.value.trim() || "",
      phone: $("#phone")?.value.trim() || "",
      email: $("#email")?.value.trim() || "",
      interested_program: $("#interested_program")?.value.trim() || "",
      follow_up_date: $("#follow_up_date")?.value || ""
    };
    const opt = { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) };
    try{
      if (editingId){
        await api("/api/leads/"+editingId, { ...opt, method:"PUT" });
        editingId = null; const saveBtn = document.getElementById("saveLead"); if (saveBtn) saveBtn.textContent = "Add Lead";
      } else {
        await api("/api/leads", opt);
      }
      const st = document.getElementById("status"); if (st) st.textContent = "Saved.";
      loadLeads();
    }catch(err){ alert(err.error || "Save failed"); }
  };
}

loadLeads();