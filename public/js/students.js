console.log("[ui] students.js loaded");
const $ = s => document.querySelector(s);
const api = (p,opt)=>fetch(p,opt).then(r=>r.ok?r.json():r.json().then(e=>Promise.reject(e)));

let showOld=false, editing=null;

(function defaults(){
  const fmt = d=>d.toISOString().slice(0,10);
  const now = new Date();
  const join = $("#join_date"); const renewal = $("#renewal_date");
  if (join) {
    join.value = fmt(now);
    const r = new Date(now); r.setDate(r.getDate()+28);
    if (renewal) renewal.value = fmt(r);
    join.addEventListener("change", ()=>{
      const d = new Date(join.value); if(!isNaN(d)){ d.setDate(d.getDate()+28); if (renewal) renewal.value = fmt(d); }
    });
  }
})();

async function loadStudents(){
  const url = showOld ? "/api/students?is_active=0" : "/api/students?is_active=1";
  const rows = await api(url);
  const tb = document.querySelector("#studentsTable tbody"); if (!tb) return;
  tb.innerHTML = "";
  rows.forEach(s=>{
    const tr = document.createElement("tr");
    const name = (s.first_name||"") + " " + (s.last_name||"");
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
        ${s.is_active?`<button class="btn btn-warn" data-act="archive" data-id="${s.id}">Archive</button>`:
                        `<button class="btn btn-primary" data-act="restore" data-id="${s.id}">Restore</button>`}
      </td>`;
    tb.appendChild(tr);
  });
  const title = document.getElementById("listTitle");
  if (title) title.textContent = showOld ? "Old Students" : "Active Students";
}

document.addEventListener("click", async (e)=>{
  const b = e.target.closest("button"); if (!b) return;
  const id = b.dataset.id, act = b.dataset.act;

  if (document.getElementById("studentsTable") && id && act) {
    try{
      if (act==="edit"){
        const s = await api("/api/students/"+id); editing=id;
        ["first_name","last_name","phone","email","program","join_date","renewal_date","address","photo"].forEach(k=>{
          const el=document.getElementById(k); if (el) el.value = s[k]||"";
        });
        const st = document.getElementById("status"); if (st) st.textContent = "Editing #"+id;
      } else if (act==="del"){
        await api("/api/students/"+id, { method:"DELETE" }); loadStudents();
      } else if (act==="archive"){
        await api(`/api/students/${id}/archive`, { method:"POST" }); loadStudents();
      } else if (act==="restore"){
        await api(`/api/students/${id}/restore`, { method:"POST" }); loadStudents();
      }
    }catch(err){ alert(err.error || "Action failed"); }
  }
});

const saveStudentBtn = document.getElementById("saveStudent");
if (saveStudentBtn){
  saveStudentBtn.onclick = async ()=>{
    const body = {
      first_name: $("#first_name")?.value.trim() || "",
      last_name:  $("#last_name")?.value.trim() || "",
      phone:      $("#phone")?.value.trim() || "",
      email:      $("#email")?.value.trim() || "",
      program:    $("#program")?.value.trim() || "",
      join_date:  $("#join_date")?.value || "",
      renewal_date: $("#renewal_date")?.value || "",
      address:    $("#address")?.value.trim() || "",
      photo:      $("#photo")?.value.trim() || "",
      is_active:  1
    };
    const opt = { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) };
    try{
      if (editing){
        await api("/api/students/"+editing, { ...opt, method:"PUT" });
        editing = null; const st = document.getElementById("status"); if (st) st.textContent = "Saved.";
      } else {
        await api("/api/students", opt);
        const st = document.getElementById("status"); if (st) st.textContent = "Added.";
      }
      loadStudents();
    }catch(err){ alert(err.error || "Save failed"); }
  };
}

const showActive = document.getElementById("showActive");
if (showActive) showActive.onclick = ()=>{ showOld=false; loadStudents(); };
const showOldBtn = document.getElementById("showOld");
if (showOldBtn) showOldBtn.onclick = ()=>{ showOld=true; loadStudents(); };

loadStudents();