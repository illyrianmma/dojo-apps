
notepad public\payments.html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Payments</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body { font-family: Arial, sans-serif; max-width: 900px; margin: 2rem auto; }
    form { margin-bottom: 1rem; }
    form input, form label { margin-right: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th, td { border: 1px solid #ddd; padding: 8px; }
    th { background: #f5f5f5; text-align: left; }
  </style>
</head>
<body>
  <h1>Payments</h1>
  <a href="index.html">Back to Home</a>

  <h2>Add Payment</h2>
  <form id="paymentForm">
    <input placeholder="Student Name" id="student_name" required />
    <input placeholder="Amount" id="amount" type="number" step="0.01" required />
    <input type="date" id="date" required />
    <label><input type="checkbox" id="taxable" /> Taxable</label>
    <button type="submit">Add Payment</button>
  </form>

  <h2>Payment List</h2>
  <table id="paymentsTable">
    <thead>
      <tr>
        <th>ID</th><th>Student</th><th>Amount</th><th>Date</th><th>Taxable</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>

  <script>
    const form = document.getElementById('paymentForm');
    const tbody = document.querySelector('#paymentsTable tbody');

    async function loadPayments() {
      const res = await fetch('/api/payments');
      const data = await res.json();
      tbody.innerHTML = data.map(p => `
        <tr>
          <td>${p.id}</td>
          <td>${p.student_name}</td>
          <td>${p.amount}</td>
          <td>${p.date}</td>
          <td>${p.taxable ? 'Yes' : 'No'}</td>
        </tr>
      `).join('');
    }

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const payload = {
        student_name: student_name.value,
        amount: parseFloat(amount.value),
        date: date.value,
        taxable: taxable.checked
      };
      await fetch('/api/payments', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      form.reset();
      loadPayments();
    });

    loadPayments();
  </script>
</body>
</html>
