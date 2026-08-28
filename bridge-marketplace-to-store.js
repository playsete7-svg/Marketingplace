/**
 * BRIDGE 1: Marketplace → Loja (Pedido)
 * =======================================
 * Problema: O pedido criado no checkout do marketplace é salvo em
 *   marketing-place-3543e/orders, mas a loja le de luk123-b1986/orders.
 *   A loja nunca recebe o pedido.
 *
 * Solucao: Apos criarOrder() no marketplace, escrever o pedido
 *   tambem no Firebase da loja usando suas credenciais.
 *
 * INTEGRACAO:
 *   No Marketingplace.html, dentro da funcao createOrder(),
 *   apos `syncCentralEntity('orders', order.id, order)`,
 *   adicionar: `await syncOrderToStore(order, store);`
 *
 *   E importar este script no <head> ou antes do script principal:
 *   <script src="supremo-bridge-config.js"></script>
 *   <script src="bridge-marketplace-to-store.js"></script>
 */

/**
 * Escreve um pedido no Firestore da loja parceira via REST API.
 * Usa as credenciais Firebase ja cadastradas no cadastro da loja.
 *
 * @param {Object} order - O pedido criado pelo marketplace
 * @param {Object} store - O cadastro da loja (tem projectId, apiKey)
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
async function syncOrderToStore(order, store) {
  if (!store?.projectId || !store?.apiKey) {
    console.warn("[Bridge1] Loja sem credenciais Firebase configuradas:", store?.id);
    return { ok: false, error: "Credenciais da loja incompletas" };
  }

  // Dados minimos do pedido que a loja precisa receber
  // NAO enviamos dados comerciais do marketplace (comissao, etc.)
  // A loja so precisa saber: o que, quanto, onde entregar, quem e o cliente
  const storeOrder = {
    id: order.id,
    publicCode: order.publicCode || "",
    source: "marketplace",
    marketplaceId: "supremo-marketplace",
    storeId: store.id,
    customerId: order.customerId || "",
    customerSnapshot: order.customerSnapshot || {},
    items: order.items || [],
    subtotal: order.subtotal || 0,
    deliveryFee: order.deliveryFee || 0,
    total: order.total || 0,
    paymentMethod: order.paymentMethod || "pending",
    paymentStatus: order.paymentStatus || "pending",
    addressSnapshot: order.addressSnapshot || {},
    storeNote: order.storeNote || "",
    status: "awaiting_store_acceptance",
    dispatchMode: order.dispatchMode || store.dispatchMode || "marketplace",
    logistics: {
      status: "waiting_store",
      courierId: null,
      courierName: null,
      rideId: null,
    },
    deliveryOffer: {
      status: "pending",
    },
    createdAt: order.createdAt || Date.now(),
    updatedAt: Date.now(),
    statusHistory: [{
      at: order.createdAt || Date.now(),
      status: "awaiting_store_acceptance",
      message: "Pedido recebido do marketplace Supremo.",
    }],
  };

  try {
    const result = await supremoRestWrite(
      store.projectId,
      store.apiKey,
      "orders",
      order.id,
      storeOrder
    );

    // Publicar evento no barramento do gestor
    await supremoPublishEvent(
      "marketplace",
      "order_synced_to_store",
      "info",
      `Pedido ${order.publicCode || order.id} enviado para loja ${store.name}`,
      order.id,
      { storeId: store.id, storeName: store.name, total: order.total }
    );

    console.log("[Bridge1] Pedido sincronizado com a loja:", store.name, order.id);
    return result;
  } catch (error) {
    console.error("[Bridge1] Falha ao sincronizar pedido com a loja:", error);
    await supremoPublishEvent(
      "marketplace",
      "order_sync_failed",
      "error",
      `Falha ao enviar pedido ${order.id} para loja ${store.name}: ${error.message}`,
      order.id,
      { storeId: store.id, error: error.message }
    );
    return { ok: false, error: error.message };
  }
}

/**
 * Atualiza o status do pedido na loja quando o marketplace
 * recebe uma mudanca (ex: cliente cancela no marketplace).
 */
async function updateOrderInStore(orderId, statusUpdate, store) {
  if (!store?.projectId || !store?.apiKey) return { ok: false, error: "Credenciais incompletas" };

  const patch = {
    ...statusUpdate,
    updatedAt: Date.now(),
  };

  try {
    // Le o statusHistory atual primeiro
    const existing = await fetch(
      `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(store.projectId)}/databases/(default)/documents/orders/${encodeURIComponent(orderId)}?key=${encodeURIComponent(store.apiKey)}`
    );
    let history = [];
    if (existing.ok) {
      const doc = await existing.json();
      const data = Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, supremoFirestoreVal(v)]));
      history = data.statusHistory || [];
    }
    history.push({ at: Date.now(), status: statusUpdate.status || "updated", message: statusUpdate.message || "" });
    patch.statusHistory = history;

    return await (window.supremoRestMergeWrite || supremoRestWrite)(store.projectId, store.apiKey, "orders", orderId, patch);
  } catch (error) {
    console.error("[Bridge1] Falha ao atualizar pedido na loja:", error);
    return { ok: false, error: error.message };
  }
}

if (typeof window !== "undefined") {
  window.syncOrderToStore = syncOrderToStore;
  window.updateOrderInStore = updateOrderInStore;
}
