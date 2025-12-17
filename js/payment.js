/**
 * assets/js/payment.js
 * Checkout + payment simulation + persistent order report logic (localStorage)
 *
 * - Menyimpan setiap order ke localStorage 'orders' (array) dan menyimpan lastOrder
 * - Menghitung subtotal, tax (11%), shipping, paymentFee (configurable)
 * - Simulasi e-wallet dengan modal
 * - Setelah sukses: clear cart, simpan order, redirect ke order-success.html
 * - Jika Anda punya backend, fungsi trySendToServer(order) akan mencoba POST ke /api/orders
 *
 * NOTE: Untuk produksi, ganti simulateDigitalPayment() dan trySendToServer() dengan integrasi gateway & server-side DB.
 */

(function () {
    // Config
    const PAYMENT_FEES = {
      'bank-transfer': 0,
      'e-wallet': 1.5, // percent
      'cod': 0
    };
  
    // State
    let selectedShipping = { type: 'regular', cost: 15000 };
    let selectedPayment = 'bank-transfer';
    let selectedProvider = null; // for e-wallet provider
    let cart = [];
  
    // Helpers
    function formatRupiah(num) {
      return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR'}).format(num);
    }
  
    function getCart() {
      return JSON.parse(localStorage.getItem('cart')) || [];
    }
  
    function round(num) { return Math.round(num); }
  
    function getOrders() {
      return JSON.parse(localStorage.getItem('orders')) || [];
    }
  
    function saveOrderRecord(order) {
      const orders = getOrders();
      orders.unshift(order); // push front so newest first
      localStorage.setItem('orders', JSON.stringify(orders));
      localStorage.setItem('lastOrder', JSON.stringify(order));
    }
  
    // Try to send to server if available (non-blocking)
    async function trySendToServer(order) {
      // if you have a server endpoint set API_ORDERS_URL variable in window scope, it'll try to send
      const url = window.API_ORDERS_URL || null;
      if (!url) return;
      try {
        await fetch(url, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(order)
        });
        // server response ignored for now; ideally handle errors & retries
      } catch (err) {
        console.warn('Send order to server failed (continuing local-only):', err);
      }
    }
  
    // UI update functions
    function renderOrderItems() {
      cart = getCart();
      const itemsContainer = document.getElementById('order-items');
      itemsContainer.innerHTML = '';
      if (!cart || cart.length === 0) {
        // If cart empty redirect to cart
        window.location.href = 'cart.html';
        return;
      }
      cart.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'order-item d-flex justify-content-between align-items-center';
        itemDiv.innerHTML = `
          <div class="d-flex align-items-center">
            <img src="${item.image}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/50x50?text=No+Image'">
            <div class="ms-3">
              <h6 class="mb-0">${item.name}</h6>
              <small class="text-muted">Qty: ${item.qty}</small>
            </div>
          </div>
          <div class="text-right">
            <strong>${formatRupiah(item.price * item.qty)}</strong>
          </div>
        `;
        itemsContainer.appendChild(itemDiv);
      });
    }
  
    function calculateTotals() {
      cart = getCart();
      let subtotal = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
      let tax = round(subtotal * 0.11);
      let preTotal = subtotal + (selectedShipping.cost || 0) + tax;
      let feePercent = PAYMENT_FEES[selectedPayment] || 0;
      let paymentFee = round(preTotal * feePercent / 100);
      let grandTotal = preTotal + paymentFee;
  
      return { subtotal, tax, preTotal, paymentFee, grandTotal };
    }
  
    function updateSummaryUI() {
      const totals = calculateTotals();
      const subtotalEl = document.getElementById('subtotal');
      const taxEl = document.getElementById('tax-amount');
      const shippingEl = document.getElementById('shipping-cost');
      const feeEl = document.getElementById('payment-fee');
      const grandEl = document.getElementById('grand-total');
  
      if (subtotalEl) subtotalEl.textContent = formatRupiah(totals.subtotal);
      if (taxEl) taxEl.textContent = formatRupiah(totals.tax);
      if (shippingEl) shippingEl.textContent = formatRupiah(selectedShipping.cost || 0);
      if (feeEl) feeEl.textContent = formatRupiah(totals.paymentFee);
      if (grandEl) grandEl.textContent = formatRupiah(totals.grandTotal);
    }
  
    // Selection functions (called from onclicks in HTML)
    window.selectShipping = function (elemOrType, maybeCost) {
      // support calls from markup: selectShipping(this, 'regular', 15000) OR selectShipping('regular', 15000)
      if (typeof elemOrType === 'string') {
        selectedShipping = { type: elemOrType, cost: maybeCost };
        // visually set active by matching input value
        document.querySelectorAll('.shipping-method').forEach(s => {
          const input = s.querySelector('input[type="radio"]');
          if (input && input.value === elemOrType) {
            s.classList.add('active'); input.checked = true;
          } else s.classList.remove('active');
        });
      } else {
        const elem = elemOrType;
        const type = maybeCost;
        const cost = arguments[2];
        document.querySelectorAll('.shipping-method').forEach(s => s.classList.remove('active'));
        elem.classList.add('active');
        elem.querySelector('input[type="radio"]').checked = true;
        selectedShipping = { type, cost };
      }
      updateSummaryUI();
    };
  
    window.selectPayment = function (elemOrMethod, maybeMethod) {
      // support selectPayment(this, 'bank-transfer') or selectPayment('bank-transfer')
      let method;
      if (typeof elemOrMethod === 'string') {
        method = elemOrMethod;
        document.querySelectorAll('.payment-method').forEach(p => {
          const input = p.querySelector('input[type="radio"]');
          if (input && input.value === method) {
            p.classList.add('active'); input.checked = true;
          } else p.classList.remove('active');
        });
      } else {
        const elem = elemOrMethod;
        method = maybeMethod;
        document.querySelectorAll('.payment-method').forEach(p => p.classList.remove('active'));
        elem.classList.add('active');
        elem.querySelector('input[type="radio"]').checked = true;
      }
  
      selectedPayment = method;
      const ewalletArea = document.getElementById('ewalletProviders');
      if (selectedPayment === 'e-wallet') {
        if (ewalletArea) ewalletArea.style.display = 'block';
        // auto-select first provider if none
        if (!selectedProvider) {
          const first = document.querySelector('.ewallet-provider');
          if (first) selectProvider(first);
        }
      } else {
        if (ewalletArea) ewalletArea.style.display = 'none';
        selectedProvider = null;
      }
      updateSummaryUI();
    };
  
    window.selectProvider = function (elem) {
      document.querySelectorAll('.ewallet-provider').forEach(p => p.classList.remove('active'));
      elem.classList.add('active');
      selectedProvider = elem.getAttribute('data-provider');
    };
  
    // Form validation
    function validateForm() {
      const requiredFields = ['firstName', 'lastName', 'email', 'phone', 'address', 'city', 'postalCode'];
      let isValid = true;
      requiredFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (!field || !field.value.trim()) {
          if (field) field.style.borderColor = '#dc3545';
          isValid = false;
        } else {
          if (field) field.style.borderColor = '#ddd';
        }
      });
  
      // Simple email check
      const email = (document.getElementById('email') || {}).value || '';
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        const f = document.getElementById('email');
        if (f) f.style.borderColor = '#dc3545';
        isValid = false;
      }
  
      if (selectedPayment === 'e-wallet' && !selectedProvider) {
        alert('Pilih provider e-wallet terlebih dahulu.');
        isValid = false;
      }
  
      return isValid;
    }
  
    // Simulate digital payment (returns Promise)
    function simulateDigitalPayment(provider, amount) {
      return new Promise((resolve, reject) => {
        const modal = document.getElementById('paymentModal');
        const title = document.getElementById('modalTitle');
        const msg = document.getElementById('modalMessage');
        const cancelBtn = document.getElementById('cancelPaymentBtn');
  
        title.textContent = `Membuka ${provider.toUpperCase()}...`;
        msg.textContent = `Silakan selesaikan pembayaran sebesar ${formatRupiah(amount)} menggunakan ${provider.toUpperCase()}.`;
        modal.style.display = 'flex';
        cancelBtn.style.display = 'none';
  
        setTimeout(() => {
          title.textContent = 'Menunggu konfirmasi pembayaran';
          msg.textContent = `Pembayaran sedang diproses oleh ${provider.toUpperCase()}...`;
          cancelBtn.style.display = 'inline-block';
        }, 1200);
  
        const timer = setTimeout(() => {
          modal.style.display = 'none';
          resolve({ success: true, provider, transactionId: 'TX-' + Date.now() });
        }, 2800);
  
        cancelBtn.onclick = () => {
          clearTimeout(timer);
          modal.style.display = 'none';
          reject(new Error('Pembayaran dibatalkan oleh pengguna.'));
        };
      });
    }
  
    // Final order creation + save
    async function processCheckout() {
      if (!validateForm()) {
        alert('Mohon lengkapi semua field yang wajib diisi dengan benar!');
        return;
      }
  
      cart = getCart();
      if (!cart || cart.length === 0) {
        alert('Keranjang kosong!');
        window.location.href = 'cart.html';
        return;
      }
  
      const buyer = {
        firstName: document.getElementById('firstName').value.trim(),
        lastName: document.getElementById('lastName').value.trim(),
        email: document.getElementById('email').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        address: document.getElementById('address').value.trim(),
        city: document.getElementById('city').value.trim(),
        postalCode: document.getElementById('postalCode').value.trim()
      };
  
      const totals = calculateTotals();
  
      // Payment handling
      let paymentResult = { success: false, provider: null, transactionId: null, pending: false };
      try {
        if (selectedPayment === 'e-wallet') {
          if (!selectedProvider) { alert('Pilih provider e-wallet.'); return; }
          paymentResult = await simulateDigitalPayment(selectedProvider, totals.grandTotal);
        } else if (selectedPayment === 'bank-transfer') {
          paymentResult = { success: true, provider: 'bank-transfer', transactionId: 'BT-' + Date.now(), pending: true };
        } else if (selectedPayment === 'cod') {
          paymentResult = { success: true, provider: 'cod', transactionId: 'COD-' + Date.now(), pending: true };
        }
      } catch (err) {
        alert(err.message || 'Pembayaran gagal.');
        return;
      }
  
      // Build order object
      const orderData = {
        orderId: 'ORD-' + Date.now(),
        customer: buyer,
        items: cart,
        shipping: selectedShipping,
        payment: {
          method: selectedPayment,
          provider: paymentResult.provider || selectedPayment,
          paymentFee: totals.paymentFee,
          amountPaid: totals.grandTotal,
          transactionId: paymentResult.transactionId,
          status: paymentResult.success ? (paymentResult.pending ? 'pending' : 'paid') : 'failed'
        },
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.grandTotal,
        createdAt: new Date().toISOString()
      };
  
      // Persist locally
      saveOrderRecord(orderData);
  
      // Try send to server (non-blocking)
      trySendToServer(orderData);
  
      // Clear cart and notify other pages
      localStorage.setItem('cart', JSON.stringify([]));
      window.dispatchEvent(new CustomEvent('cartChanged'));
      window.dispatchEvent(new StorageEvent('storage', { key: 'cart', newValue: localStorage.getItem('cart') }));
  
      // Redirect to success
      window.location.href = 'order-success.html';
    }
  
    // Attach to pay button
    document.addEventListener('DOMContentLoaded', () => {
      renderOrderItems();
      updateSummaryUI();
  
      const payBtn = document.getElementById('payNowBtn');
      if (payBtn) payBtn.addEventListener('click', processCheckout);
  
      // Make sure UI initial active classes reflect defaults
      document.querySelectorAll('.shipping-method').forEach((el) => {
        const input = el.querySelector('input[type="radio"]');
        if (input && input.value === selectedShipping.type) el.classList.add('active');
      });
      document.querySelectorAll('.payment-method').forEach((el) => {
        const input = el.querySelector('input[type="radio"]');
        if (input && input.value === selectedPayment) el.classList.add('active');
      });
  
      // Keyboard accessibility
      document.querySelectorAll('.shipping-method, .payment-method').forEach(el => {
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') el.click(); });
      });
    });
  
    // Expose for debugging
    window._checkout = { calculateTotals, getCart, renderOrderItems, updateSummaryUI, getOrders };
  })();