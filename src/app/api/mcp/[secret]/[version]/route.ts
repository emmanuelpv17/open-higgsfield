/* The same connector under a version segment (`…/<secret>/v2`): a new URL
   without a query, for clients that mishandle one, to make Claude treat the
   connector as new and fetch its tool list again. */
export { DELETE, GET, POST } from "../route";

export const runtime = "nodejs";
export const maxDuration = 60;
