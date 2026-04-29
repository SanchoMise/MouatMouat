import { getStore } from "@netlify/blobs";

export default async (req) => {
  const store = getStore("charges-data");

  try {
    const { key, value } = await req.json();
    await store.set(key, value);
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/save-data" };
