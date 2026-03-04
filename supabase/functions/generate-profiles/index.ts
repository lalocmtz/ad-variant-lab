import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { brand_id, brand_name, brand_description, brand_intelligence, user_id } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const systemPrompt = `You are a marketing strategist. Generate exactly 10 unique customer profiles for the brand described below. Each profile should represent a distinct customer segment with different demographics, motivations, and messaging angles.`;

    const userPrompt = `Brand: ${brand_name}
Description: ${brand_description || "N/A"}
Brand Intelligence: ${brand_intelligence || "N/A"}

Generate 10 customer profiles. Use the suggest_profiles tool.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "suggest_profiles",
            description: "Return 10 customer profiles",
            parameters: {
              type: "object",
              properties: {
                profiles: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string", description: "Profile persona name, e.g. 'Busy Working Mom'" },
                      age_range: { type: "string", description: "e.g. '25-34'" },
                      pain_points: { type: "string", description: "Key frustrations" },
                      desires: { type: "string", description: "What they want" },
                      messaging_angle: { type: "string", description: "Best ad messaging approach" },
                    },
                    required: ["name", "age_range", "pain_points", "desires", "messaging_angle"],
                  },
                },
              },
              required: ["profiles"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest_profiles" } },
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error(`AI error: ${response.status}`);
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const parsed = JSON.parse(toolCall.function.arguments);
    const profilesArr = parsed.profiles;

    // Insert into DB
    const rows = profilesArr.map((p: any) => ({
      brand_id,
      name: p.name,
      age_range: p.age_range,
      pain_points: p.pain_points,
      desires: p.desires,
      messaging_angle: p.messaging_angle,
      user_id,
    }));

    const { error: insertErr } = await supabase.from("customer_profiles").insert(rows);
    if (insertErr) throw insertErr;

    return new Response(JSON.stringify({ count: rows.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-profiles error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
