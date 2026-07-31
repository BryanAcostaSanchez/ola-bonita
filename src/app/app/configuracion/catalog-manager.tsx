"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Hint } from "./hint";

type Category = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  sort_order: number;
};
type Service = {
  id: string;
  category_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  price_cents: number;
  active: boolean;
  online_bookable: boolean;
  sort_order: number;
};
type Product = {
  id: string;
  name: string;
  sku: string | null;
  price_cents: number;
  stock_quantity: number | null;
  active: boolean;
};
type ServiceEdit = {
  id: string;
  categoryId: string;
  duration: string;
  price: string;
};
type ProductEdit = {
  id: string;
  name: string;
  sku: string;
  price: string;
  stock: string;
};

const money = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
});
const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
const cents = (value: string) =>
  Math.round(Number(value.replace(",", ".")) * 100);

export function CatalogManager({
  categories,
  services,
  products,
}: {
  categories: Category[];
  services: Service[];
  products: Product[];
}) {
  const [serviceList, setServiceList] = useState(services);
  const [productList, setProductList] = useState(products);
  const [categoryList, setCategoryList] = useState(categories);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [serviceDraft, setServiceDraft] = useState({
    name: "",
    categoryId: categories[0]?.id ?? "",
    price: "",
    duration: "30",
    description: "",
    online: true,
  });
  const [productDraft, setProductDraft] = useState({
    name: "",
    sku: "",
    price: "",
    stock: "",
  });
  const [categoryDraft, setCategoryDraft] = useState("");
  const [categoryEdit, setCategoryEdit] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(
    null,
  );
  const [serviceEdit, setServiceEdit] = useState<ServiceEdit | null>(null);
  const [productEdit, setProductEdit] = useState<ProductEdit | null>(null);
  const client = createClient();

  const save = async (
    work: () => PromiseLike<{ error: { message: string } | null }>,
    success: string,
  ) => {
    setBusy(true);
    setMessage("");
    const { error } = await work();
    setBusy(false);
    setMessage(error?.message || success);
    return !error;
  };
  const updateServiceList = (id: string, update: Partial<Service>) =>
    setServiceList((list) =>
      list.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  const updateProductList = (id: string, update: Partial<Product>) =>
    setProductList((list) =>
      list.map((item) => (item.id === id ? { ...item, ...update } : item)),
    );
  const categoryName = (id: string) =>
    categoryList.find((category) => category.id === id)?.name ||
    "Sin categoría";
  const activeCategories = categoryList.filter((category) => category.active);

  async function addCategory(event: FormEvent) {
    event.preventDefault();
    const name = categoryDraft.trim();
    if (!name) return;
    if (
      await save(
        () =>
          client
            .from("service_categories")
            .insert({
              name,
              slug: slugify(name),
              sort_order: categoryList.length,
            }),
        "Categoría agregada.",
      )
    ) {
      setCategoryList((list) => [
        ...list,
        {
          id: crypto.randomUUID(),
          name,
          slug: slugify(name),
          active: true,
          sort_order: list.length,
        },
      ]);
      window.location.reload();
    }
  }
  async function saveCategory() {
    if (!categoryEdit?.name.trim()) return;
    const name = categoryEdit.name.trim();
    if (
      await save(
        () =>
          client
            .from("service_categories")
            .update({ name, slug: slugify(name) })
            .eq("id", categoryEdit.id),
        "Categoría actualizada.",
      )
    ) {
      setCategoryList((list) =>
        list.map((item) =>
          item.id === categoryEdit.id
            ? { ...item, name, slug: slugify(name) }
            : item,
        ),
      );
      setCategoryEdit(null);
    }
  }
  async function removeCategory(category: Category) {
    setBusy(true);
    setMessage("");
    const { error: serviceError } = await client
      .from("services")
      .update({ active: false, online_bookable: false })
      .eq("category_id", category.id);
    if (serviceError) {
      setBusy(false);
      setMessage(serviceError.message);
      return;
    }
    const { error } = await client
      .from("service_categories")
      .update({ active: false })
      .eq("id", category.id);
    setBusy(false);
    if (error) return setMessage(error.message);
    setCategoryList((list) =>
      list.map((item) =>
        item.id === category.id ? { ...item, active: false } : item,
      ),
    );
    setServiceList((list) =>
      list.map((item) =>
        item.category_id === category.id
          ? { ...item, active: false, online_bookable: false }
          : item,
      ),
    );
    setCategoryToDelete(null);
    setMessage("Categoría eliminada del catálogo. El historial se conservó.");
  }
  async function restoreCategory(category: Category) {
    if (
      await save(
        () =>
          client
            .from("service_categories")
            .update({ active: true })
            .eq("id", category.id),
        "Categoría restaurada. Reactiva los servicios que quieras volver a vender.",
      )
    )
      setCategoryList((list) =>
        list.map((item) =>
          item.id === category.id ? { ...item, active: true } : item,
        ),
      );
  }
  async function addService(event: FormEvent) {
    event.preventDefault();
    if (!serviceDraft.name || !serviceDraft.categoryId || !serviceDraft.price)
      return;
    if (
      await save(
        () =>
          client
            .from("services")
            .insert({
              name: serviceDraft.name.trim(),
              category_id: serviceDraft.categoryId,
              price_cents: cents(serviceDraft.price),
              duration_minutes: Number(serviceDraft.duration),
              description: serviceDraft.description.trim() || null,
              online_bookable: serviceDraft.online,
              active: true,
              sort_order: serviceList.length,
            }),
        "Servicio agregado.",
      )
    )
      window.location.reload();
  }
  async function saveService() {
    if (
      !serviceEdit ||
      !serviceEdit.categoryId ||
      !serviceEdit.duration ||
      !serviceEdit.price
    )
      return;
    const update = {
      category_id: serviceEdit.categoryId,
      duration_minutes: Number(serviceEdit.duration),
      price_cents: cents(serviceEdit.price),
    };
    if (!Number.isFinite(update.price_cents) || update.duration_minutes < 5)
      return setMessage("Revisa precio y duración.");
    if (
      await save(
        () => client.from("services").update(update).eq("id", serviceEdit.id),
        "Servicio actualizado.",
      )
    ) {
      updateServiceList(serviceEdit.id, update);
      setServiceEdit(null);
    }
  }
  async function removeService(service: Service) {
    if (
      !window.confirm(
        `¿Eliminar “${service.name}” del catálogo y POS? Sus ventas anteriores se conservarán.`,
      )
    )
      return;
    if (
      await save(
        () =>
          client
            .from("services")
            .update({ active: false, online_bookable: false })
            .eq("id", service.id),
        "Servicio eliminado del catálogo. El historial se conservó.",
      )
    )
      updateServiceList(service.id, { active: false, online_bookable: false });
  }
  async function addProduct(event: FormEvent) {
    event.preventDefault();
    if (!productDraft.name || !productDraft.price) return;
    if (
      await save(
        () =>
          client
            .from("pos_products")
            .insert({
              name: productDraft.name.trim(),
              sku: productDraft.sku.trim() || null,
              price_cents: cents(productDraft.price),
              stock_quantity:
                productDraft.stock === "" ? null : Number(productDraft.stock),
              active: true,
            }),
        "Producto agregado al POS.",
      )
    )
      window.location.reload();
  }
  async function saveProduct() {
    if (!productEdit?.name.trim() || productEdit.price === "") return;
    const update = {
      name: productEdit.name.trim(),
      sku: productEdit.sku.trim() || null,
      price_cents: cents(productEdit.price),
      stock_quantity:
        productEdit.stock === "" ? null : Number(productEdit.stock),
    };
    if (
      !Number.isFinite(update.price_cents) ||
      update.price_cents < 0 ||
      (update.stock_quantity !== null && update.stock_quantity < 0)
    )
      return setMessage("Revisa el precio y el inventario.");
    if (
      await save(
        () =>
          client.from("pos_products").update(update).eq("id", productEdit.id),
        "Producto actualizado.",
      )
    ) {
      updateProductList(productEdit.id, update);
      setProductEdit(null);
    }
  }
  async function toggleService(
    service: Service,
    field: "active" | "online_bookable",
  ) {
    const next = !service[field];
    if (
      await save(
        () =>
          client
            .from("services")
            .update({ [field]: next })
            .eq("id", service.id),
        "Servicio actualizado.",
      )
    )
      updateServiceList(service.id, { [field]: next });
  }
  async function toggleProduct(product: Product) {
    const active = !product.active;
    if (
      await save(
        () =>
          client.from("pos_products").update({ active }).eq("id", product.id),
        "Producto actualizado.",
      )
    )
      updateProductList(product.id, { active });
  }

  return (
    <section className="catalog-settings">
      <header className="settings-header compact-settings">
        <div>
          <p className="eyebrow">CATÁLOGO Y POS</p>
          <h1>Catálogo de servicios</h1>
          <p>Edita lo que se vende, se agenda y se muestra al público.</p>
        </div>
      </header>
      <div className="catalog-columns catalog-actions">
        <section className="settings-card catalog-card">
          <p className="eyebrow">ORGANIZACIÓN</p>
          <h2>
            Categorías <Hint text="Agrupan servicios parecidos." />
          </h2>
          <p className="catalog-help">
            Eliminar las oculta del catálogo; no modifica ventas pasadas.
          </p>
          <form className="inline-add" onSubmit={addCategory}>
            <input
              value={categoryDraft}
              onChange={(event) => setCategoryDraft(event.target.value)}
              placeholder="Ej. Terapias corporales"
            />
            <button className="new-booking" disabled={busy}>
              Agregar
            </button>
          </form>
          <div className="category-editor-list">
            {categoryList.map((category) =>
              categoryEdit?.id === category.id ? (
                <div key={category.id}>
                  <input
                    value={categoryEdit.name}
                    onChange={(event) =>
                      setCategoryEdit({
                        ...categoryEdit,
                        name: event.target.value,
                      })
                    }
                  />
                  <button type="button" onClick={saveCategory} disabled={busy}>
                    Guardar
                  </button>
                  <button type="button" onClick={() => setCategoryEdit(null)}>
                    Cancelar
                  </button>
                </div>
              ) : (
                <div
                  key={category.id}
                  className={!category.active ? "is-archived" : ""}
                >
                  <span>{category.name}</span>
                  {!category.active && <small>Eliminada</small>}
                  <button
                    type="button"
                    onClick={() =>
                      setCategoryEdit({ id: category.id, name: category.name })
                    }
                  >
                    Editar
                  </button>
                  {category.active ? (
                    <button
                      type="button"
                      className="danger-action"
                      disabled={busy}
                      onClick={() => setCategoryToDelete(category)}
                    >
                      Eliminar
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => restoreCategory(category)}
                    >
                      Restaurar
                    </button>
                  )}
                </div>
              ),
            )}
          </div>
          {categoryToDelete && (
            <div className="catalog-delete-warning" role="alert">
              <strong>Antes de eliminar “{categoryToDelete.name}”</strong>
              <p>
                {serviceList.filter(
                  (service) => service.category_id === categoryToDelete.id,
                ).length
                  ? `Esta categoría contiene ${serviceList.filter((service) => service.category_id === categoryToDelete.id).length} servicios. Se ocultarán del catálogo, POS y reservas nuevas.`
                  : "Esta categoría no contiene servicios activos."}
              </p>
              <p>
                Si hay servicios que quieres conservar, te recomendamos moverlos
                o cambiar su categoría antes de continuar.
              </p>
              <div>
                <button type="button" onClick={() => setCategoryToDelete(null)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="danger-action"
                  disabled={busy}
                  onClick={() => removeCategory(categoryToDelete)}
                >
                  Eliminar categoría
                </button>
              </div>
            </div>
          )}
        </section>
        <section className="settings-card catalog-card service-add-card">
          <p className="eyebrow">NUEVO SERVICIO</p>
          <h2>
            Agregar servicio <Hint text="Se vende desde el punto de venta." />
          </h2>
          <p className="catalog-help">El precio aquí es el que paga la clienta.</p>
          <form className="catalog-form" onSubmit={addService}>
            <input
              required
              value={serviceDraft.name}
              onChange={(event) =>
                setServiceDraft({ ...serviceDraft, name: event.target.value })
              }
              placeholder="Nombre del servicio"
            />
            <div className="form-columns">
              <select
                required
                value={serviceDraft.categoryId}
                onChange={(event) =>
                  setServiceDraft({
                    ...serviceDraft,
                    categoryId: event.target.value,
                  })
                }
              >
                {activeCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <input
                required
                type="number"
                min="5"
                step="5"
                value={serviceDraft.duration}
                onChange={(event) =>
                  setServiceDraft({
                    ...serviceDraft,
                    duration: event.target.value,
                  })
                }
                placeholder="Duración (min)"
              />
              <input
                required
                inputMode="decimal"
                value={serviceDraft.price}
                onChange={(event) =>
                  setServiceDraft({
                    ...serviceDraft,
                    price: event.target.value,
                  })
                }
                placeholder="Precio MXN"
              />
            </div>
            <input
              value={serviceDraft.description}
              onChange={(event) =>
                setServiceDraft({
                  ...serviceDraft,
                  description: event.target.value,
                })
              }
              placeholder="Descripción (opcional)"
            />
            <label className="check-label web-booking-toggle">
              <input
                type="checkbox"
                checked={serviceDraft.online}
                onChange={(event) =>
                  setServiceDraft({
                    ...serviceDraft,
                    online: event.target.checked,
                  })
                }
              />
              <span><strong>Disponible para reservar en el sitio web</strong><small>Actívalo sólo si quieres que el público lo vea y pueda agendarlo.</small></span>
              <Hint text="Lo muestra en olabonita.shop." />
            </label>
            <p className="commission-note"><strong>¿Cuánto recibe cada especialista?</strong> La comisión se define por persona y servicio, porque no siempre es igual. <Link href="/app/configuracion?seccion=equipo">Configurar comisiones en Equipo →</Link></p>
            <button
              className="new-booking"
              disabled={busy || !activeCategories.length}
            >
              Agregar servicio
            </button>
          </form>
        </section>
      </div>

      <section className="settings-card catalog-table-card">
        <div className="catalog-table-head">
          <div>
            <p className="eyebrow">SERVICIOS</p>
            <h2>Servicios creados</h2>
            <p>
              Eliminar los quita de ventas y reservas nuevas, sin tocar el
              historial.
            </p>
          </div>
          <strong>{serviceList.length} servicios</strong>
        </div>
        <div className="catalog-table-wrap">
          <table className="catalog-table">
            <thead>
              <tr>
                <th>Servicio</th>
                <th>Categoría</th>
                <th>Duración</th>
                <th>Precio</th>
                <th>Reservable en web</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {serviceList.map((service) => {
                const editing = serviceEdit?.id === service.id;
                return (
                  <tr
                    key={service.id}
                    className={!service.active ? "is-archived" : ""}
                  >
                    <td>
                      <strong>{service.name}</strong>
                      {service.description && (
                        <small>{service.description}</small>
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <select
                          value={serviceEdit.categoryId}
                          onChange={(event) =>
                            setServiceEdit({
                              ...serviceEdit,
                              categoryId: event.target.value,
                            })
                          }
                        >
                          {activeCategories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        categoryName(service.category_id)
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          type="number"
                          min="5"
                          step="5"
                          value={serviceEdit.duration}
                          onChange={(event) =>
                            setServiceEdit({
                              ...serviceEdit,
                              duration: event.target.value,
                            })
                          }
                        />
                      ) : (
                        `${service.duration_minutes} min`
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input
                          inputMode="decimal"
                          value={serviceEdit.price}
                          onChange={(event) =>
                            setServiceEdit({
                              ...serviceEdit,
                              price: event.target.value,
                            })
                          }
                        />
                      ) : (
                        money.format(service.price_cents / 100)
                      )}
                    </td>
                    <td>
                      <label className="table-toggle">
                        <input
                          type="checkbox"
                          checked={service.online_bookable}
                          disabled={!service.active}
                          onChange={() =>
                            toggleService(service, "online_bookable")
                          }
                        />
                        <span>{service.online_bookable ? "Sí" : "No"}</span>
                      </label>
                    </td>
                    <td>
                      <label className="table-toggle">
                        <input
                          type="checkbox"
                          checked={service.active}
                          onChange={() => toggleService(service, "active")}
                        />
                        <span>{service.active ? "Activo" : "Eliminado"}</span>
                      </label>
                    </td>
                    <td className="table-actions">
                      {editing ? (
                        <>
                          <button
                            type="button"
                            onClick={saveService}
                            disabled={busy}
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => setServiceEdit(null)}
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() =>
                              setServiceEdit({
                                id: service.id,
                                categoryId: service.category_id,
                                duration: String(service.duration_minutes),
                                price: String(service.price_cents / 100),
                              })
                            }
                          >
                            Editar
                          </button>
                          {service.active && (
                            <button
                              type="button"
                              className="danger-action"
                              disabled={busy}
                              onClick={() => removeService(service)}
                            >
                              Eliminar
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <details className="settings-card product-panel">
        <summary>
          <span>
            <p className="eyebrow">PRODUCTOS DEL POS</p>
            <h2>Productos para vender en mostrador</h2>
            <small>No aparecen en el sitio web ni en reservas.</small>
          </span>
          <b>
            {productList.length} producto{productList.length === 1 ? "" : "s"}{" "}
            <i>⌄</i>
          </b>
        </summary>
        <div className="product-panel-content">
          <form className="catalog-form product-form" onSubmit={addProduct}>
            <div className="form-columns">
              <input
                required
                value={productDraft.name}
                onChange={(event) =>
                  setProductDraft({ ...productDraft, name: event.target.value })
                }
                placeholder="Nombre del producto"
              />
              <input
                value={productDraft.sku}
                onChange={(event) =>
                  setProductDraft({ ...productDraft, sku: event.target.value })
                }
                placeholder="SKU (opcional)"
              />
              <input
                required
                inputMode="decimal"
                value={productDraft.price}
                onChange={(event) =>
                  setProductDraft({
                    ...productDraft,
                    price: event.target.value,
                  })
                }
                placeholder="Precio MXN"
              />
              <input
                inputMode="numeric"
                value={productDraft.stock}
                onChange={(event) =>
                  setProductDraft({
                    ...productDraft,
                    stock: event.target.value,
                  })
                }
                placeholder="Stock (vacío = sin control)"
              />
            </div>
            <button className="new-booking" disabled={busy}>
              Agregar producto al POS
            </button>
          </form>
          {productList.length ? (
            <div className="catalog-table-wrap">
              <table className="catalog-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>SKU</th>
                    <th>Precio</th>
                    <th>Stock</th>
                    <th>Estado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {productList.map((product) => {
                    const editing = productEdit?.id === product.id;
                    return (
                      <tr key={product.id}>
                        <td>
                          {editing ? (
                            <input
                              value={productEdit.name}
                              onChange={(event) =>
                                setProductEdit({
                                  ...productEdit,
                                  name: event.target.value,
                                })
                              }
                            />
                          ) : (
                            <strong>{product.name}</strong>
                          )}
                        </td>
                        <td>
                          {editing ? (
                            <input
                              value={productEdit.sku}
                              onChange={(event) =>
                                setProductEdit({
                                  ...productEdit,
                                  sku: event.target.value,
                                })
                              }
                            />
                          ) : (
                            product.sku || "—"
                          )}
                        </td>
                        <td>
                          {editing ? (
                            <input
                              inputMode="decimal"
                              value={productEdit.price}
                              onChange={(event) =>
                                setProductEdit({
                                  ...productEdit,
                                  price: event.target.value,
                                })
                              }
                            />
                          ) : (
                            money.format(product.price_cents / 100)
                          )}
                        </td>
                        <td>
                          {editing ? (
                            <input
                              inputMode="numeric"
                              value={productEdit.stock}
                              onChange={(event) =>
                                setProductEdit({
                                  ...productEdit,
                                  stock: event.target.value,
                                })
                              }
                            />
                          ) : product.stock_quantity === null ? (
                            "Sin control"
                          ) : (
                            product.stock_quantity
                          )}
                        </td>
                        <td>
                          <label className="table-toggle">
                            <input
                              type="checkbox"
                              checked={product.active}
                              onChange={() => toggleProduct(product)}
                            />
                            <span>{product.active ? "Activo" : "Pausado"}</span>
                          </label>
                        </td>
                        <td className="table-actions">
                          {editing ? (
                            <>
                              <button
                                type="button"
                                onClick={saveProduct}
                                disabled={busy}
                              >
                                Guardar
                              </button>
                              <button
                                type="button"
                                onClick={() => setProductEdit(null)}
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setProductEdit({
                                  id: product.id,
                                  name: product.name,
                                  sku: product.sku ?? "",
                                  price: String(product.price_cents / 100),
                                  stock:
                                    product.stock_quantity === null
                                      ? ""
                                      : String(product.stock_quantity),
                                })
                              }
                            >
                              Editar
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-services">Aún no hay productos de mostrador.</p>
          )}
        </div>
      </details>
      {message && <p className="access-message settings-message">{message}</p>}
    </section>
  );
}
