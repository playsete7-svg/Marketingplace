/**
 * BRIDGE 5: Marketplace → Central de Clientes (CRM) + Gestor Geral
 * ==================================================================
 * O marketplace ja escreve pedidos na loja (Bridge 1) e clientes na loja
 * (syncCustomerToStores). Mas a Central de Clientes e o Gestor leem dos
 * SEUS proprios Firebases, onde ninguem escreve.
 *
 * Esta bridge replica pedidos e clientes para:
 *   - central-de-clientes-2741f (CRM)
 *   - gestor-geral-6ce8d (Gestor Geral)
 *
 * Tudo via REST API (fetch PATCH) — mesmo padrao da Bridge 1.
 */

const CRM_CFG = SUPREMO_BRIDGE_CONFIG.customers;
const GESTOR_CFG = SUPREMO_BRIDGE_CONFIG.gestor;

/**
 * Replica um pedido para a Central de Clientes e o Gestor.
 * Chamada apos createOrder() no marketplace.
 */
async function syncOrderToCRMandGestor(order) {
  const orderPayload = {
    id: order.id,
    publicCode: order.publicCode || "",
    source: "marketplace",
    storeId: order.storeId || "",
    storeSnapshot: order.storeSnapshot || {},
    customerId: order.customerId || "",
    customerSnapshot: order.customerSnapshot || {},
    items: order.items || [],
    subtotal: order.subtotal || 0,
    deliveryFee: order.deliveryFee || 0,
    total: order.total || 0,
    paymentMethod: order.paymentMethod || "pending",
    paymentStatus: order.paymentStatus || "pending",
    addressSnapshot: order.addressSnapshot || {},
    status: order.status || "awaiting_store_acceptance",
    dispatchMode: order.dispatchMode || "marketplace",
    createdAt: order.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  const targets = [
    { name: "CRM", cfg: CRM_CFG, collection: "orders" },
    { name: "Gestor", cfg: GESTOR_CFG, collection: "orders" },
  ];

  const results = await Promise.allSettled(
    targets.map(t => (window.supremoRestMergeWrite || supremoRestWrite)(t.cfg.projectId, t.cfg.apiKey, t.collection, order.id, orderPayload))
  );

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      console.log(`[Bridge5] Pedido ${order.id} replicado para ${targets[i].name}`);
    } else {
      console.warn(`[Bridge5] Falha ao replicar pedido para ${targets[i].name}:`, r.reason?.message);
    }
  });

  return { ok: results.some(r => r.status === "fulfilled") };
}

/**
 * Replica um cliente (usuario) para a Central de Clientes e o Gestor.
 * Chamada apos criar/alterar conta no marketplace.
 */
async function syncCustomerToCRMandGestor(customer) {
  const userPayload = {
    id: customer.id || customer.uid || "",
    uid: customer.uid || customer.id || "",
    name: customer.name || customer.displayName || "",
    displayName: customer.displayName || customer.name || "",
    email: customer.email || "",
    phone: customer.phone || "",
    addresses: Array.isArray(customer.addresses) ? customer.addresses : [],
    savedAddresses: Array.isArray(customer.savedAddresses) ? customer.savedAddresses : [],
    savedAddressRecords: Array.isArray(customer.savedAddressRecords) ? customer.savedAddressRecords : [],
    defaultAddressId: customer.defaultAddressId || null,
    preferences: customer.preferences || { transactional: true, marketing: false },
    role: "customer",
    source: "marketplace",
    createdAt: customer.createdAt || Date.now(),
    updatedAt: Date.now(),
  };

  if (!userPayload.id) {
    console.warn("[Bridge5] Cliente sem ID, pulando replicacao");
    return { ok: false };
  }

  const targets = [
    { name: "CRM", cfg: CRM_CFG, collection: "users" },
    { name: "Gestor", cfg: GESTOR_CFG, collection: "users" },
  ];

  const results = await Promise.allSettled(
    targets.map(t => (window.supremoRestMergeWrite || supremoRestWrite)(t.cfg.projectId, t.cfg.apiKey, t.collection, userPayload.id, userPayload))
  );

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      console.log(`[Bridge5] Cliente ${userPayload.id} replicado para ${targets[i].name}`);
    } else {
      console.warn(`[Bridge5] Falha ao replicar cliente para ${targets[i].name}:`, r.reason?.message);
    }
  });

  return { ok: results.some(r => r.status === "fulfilled") };
}

if (typeof window !== "undefined") {
  window.syncOrderToCRMandGestor = syncOrderToCRMandGestor;
  window.syncCustomerToCRMandGestor = syncCustomerToCRMandGestor;
}
