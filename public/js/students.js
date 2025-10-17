console.log("[ui] students.js loaded");
const $ = s => document.querySelector(s);
const api = (p,opt)=>fetch(p,opt).then(r=>r.ok?r.json():r.json().then(e=>Promise.reject(e)));

let showOld=false, editing=null;

(function defaults(){
  const fmt = d=>d.toISOString().slice(0,10);
  const now = new Date();
  const join = document.getElementById("join_date");
  const renewal = document.getElementById("renewal_date");
  if (join) {
    join.value = fmt(now);
    const r = new Date(now); r.setDate(r.getDate()+28);
    if (renewal) renewal.value = fmt(r);
    join.addEventListener("change", ()=>{
      const d = new Date(join.value);
      if(!isNaN(d)){ d.setDate(d.getDate()+28); if (renewal) renewal.value = fmt(d); }
    });
  }
})();

async function fetchAllStudents(){
  try { return await api("/students"); }           // prefer compat
  catch(e){
    try { return await api("/api/students"); }     // fallback
    catch(e2){ console.error("Failed to load students", e, e2); return []; }
  }
}

function asActive(s){
  return (s.is_active === undefined || s.is_active === null || s.is_active === 1 || s.is_active === true);
}

async function loadStudents(){
  const all = await fetchAllStudents();
  console.log("[ui] fetched", all.length, "students");
  const rows = all.filter(s => showOld ? !asActive(s) : asActive(s));

  const tb = document.querySelector("#studentsTable tbody"); if (!tb) return;
  tb.innerHTML = "";

  if (!rows.length){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="7" style="opacity:.7">No ${showOld?"old":"active"} students yet.</td>`;
    tb.appendChild(tr);
  } else {
    rows.forEach(s=>{
      const tr = document.createElement("tr");
      const name = [s.first_name||"", s.last_name||""].join(" ").trim();
      const img = s.photo ? `<img class="student-photo" src="${s.photo}" alt="">` : "";
      tr.innerHTML = `
        <td>${img}</td>
        <td>${name}</td>
        <td>${s.phone||""}</td>
        <td>${s.program||""}</td>
        <td>${s.join_date||""}</td>
        <td>${s.renewal_date||""}</td>
        <td>
          <button class="btn" data-act="edit" data-id="${s.id}">Edit</button>
          <button class="btn btn-danger" data-act="del" data-id="${s.id}">Delete</button>
          ${asActive(s)
            ? `<button class="btn btn-warn" data-act="archive" data-id="${s.id}">Archive</button>`
            : `<button class="btn btn-primary" data-act="restore" data-id="${s.id}">Restore</button>`}
        </td>`;
      tb.appendChild(tr);
    });
  }

  const title = document.getElementById("listTitle");
  if (title) title.textContent = showOld ? "Old Students" : "Active Students";
}

document.addEventListener("click", async (e)=>{
  const b = e.target.closest("button"); if (!b) return;
  const id = b.dataset.id, act = b.dataset.act;

  if (document.getElementById("studentsTable") && id && act) {
    try{
      if (act==="edit"){
        const s = await api("/students/"+id).catch(()=>api("/api/students/"+id));
        editing=id;
        ["first_name","last_name","phone","email","program","join_date","renewal_date","address","photo"].forEach(k=>{
          const el=document.getElementById(k); if (el) el.value = s[k]||"";
        });
        const st = document.getElementById("status"); if (st) st.textContent = "Editing #"+id;
      } else if (act==="del"){
        await api("/students/"+id, { method:"DELETE" }).catch(()=>api("/api/students/"+id, { method:"DELETE" }));
        loadStudents();
      } else if (act==="archive"){
        await api(`/students/${id}/archive`, { method:"POST" }).catch(()=>api(`/api/students/${id}/archive`, { method:"POST" }));
        loadStudents();
      } else if (act==="restore"){
        await api(`/students/${id}/restore`, { method:"POST" }).catch(()=>api(`/api/students/${id}/restore`, { method:"POST" }));
        loadStudents();
      }
    }catch(err){ alert(err.error || "Action failed"); }
  }
});

document.getElementById("saveStudent")?.addEventListener("click", async ()=>{
  const body = {
    first_name: document.getElementById("first_name")?.value.trim() || "",
    last_name:  document.getElementById("last_name")?.value.trim() || "",
    phone:      document.getElementById("phone")?.value.trim() || "",
    email:      document.getElementById("email")?.value.trim() || "",
    program:    document.getElementById("program")?.value.trim() || "",
    join_date:  document.getElementById("join_date")?.value || "",
    renewal_date: document.getElementById("renewal_date")?.value || "",
    address:    document.getElementById("address")?.value.trim() || "",
    photo:      document.getElementById("photo")?.value.trim() || "",
    is_active:  1
  };
  const opt = { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) };
  try{
    if (typeof editing === "string" || typeof editing === "number"){
      await api("/students/"+editing, { ...opt, method:"PUT" }).catch(()=>api("/api/students/"+editing, { ...opt, method:"PUT" }));
      editing = null;
    } else {
      await api("/students", opt).catch(()=>api("/api/students", opt));
    }
    const st = document.getElementById("status"); if (st) st.textContent = "Saved.";
    loadStudents();
  }catch(err){ alert(err.error || "Save failed"); }
});

document.getElementById("showActive")?.addEventListener("click", ()=>{ showOld=false; loadStudents(); });
document.getElementById("showOld")?.addEventListener("click", ()=>{ showOld=true; loadStudents(); });

loadStudents();