/* Shared note history for active and archived student cards. */
function studentNotesHTML(student) {
  const escape = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<details style="margin-top:8px"><summary>Notes</summary>
    <div class="student-notes-history small" style="white-space:pre-wrap;margin:8px 0">${escape(student.notes) || 'No notes yet.'}</div>
    <form data-student-note="${student.id}">
      <label>New note <textarea name="note" rows="3" required placeholder="Add a note — previous notes are kept" style="width:100%;box-sizing:border-box"></textarea></label>
      <button type="submit">Add Note</button>
      <span class="small" role="status"></span>
    </form></details>`;
}
document.addEventListener('submit', async event => {
  const form = event.target.closest('form[data-student-note]');
  if (!form) return;
  event.preventDefault();
  const button = form.querySelector('button');
  if (button.disabled) return;
  const input = form.querySelector('textarea');
  const status = form.querySelector('[role="status"]');
  button.disabled = true;
  try {
    const response = await fetch('/api/students/' + encodeURIComponent(form.dataset.studentNote) + '/notes', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({note: input.value})
    });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || 'Unable to save note.');
    form.parentElement.querySelector('.student-notes-history').textContent = result.notes || '';
    input.value = '';
    status.textContent = 'Note saved.';
  } catch (error) { status.textContent = 'Save failed: ' + error.message; }
  finally { button.disabled = false; }
});
