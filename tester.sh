#!/usr/bin/env bash
# about-core regression checks (curl + jq). Run from the about-core folder, with the server running:
#   ADMIN_SECRET=testing_sec bash about-core-regression.sh
# Needs: curl, jq. Optional: mongosh + MONGO_URI (legacy-document checks), CLOUDINARY_* in .env (asset checks).
# It creates its own test data (everything is named "Zz ... <run id>") and deletes it at the end.
# Uploads use real Cloudinary, so leftover files stay in Cloudinary (listed at the end).

set -u

_AS="${ADMIN_SECRET:-testing_sec}"
if [ -f .env ]; then set -a; . ./.env 2>/dev/null; set +a; fi   # CLOUDINARY_*, MONGO_URI
ADMIN_SECRET="$_AS"
API="${API:-http://localhost:5000/api/v1}"
DIR="${DIR:-/data/shibraj/3D modeling/Blender/macroboard design}"
IMG="$DIR/render1.jpg"
GLB="$DIR/tactile_switch_b3f.glb"
AUTH=(-H "Authorization: Bearer $ADMIN_SECRET")
JSON=(-H "Content-Type: application/json")
T="$(date +%s)"
TMP="/tmp/zz-reg-$T"; mkdir -p "$TMP"

PASS=0; FAIL=0; SKIPPED=0; FAILS=()
PROJECTS=(); PEOPLE=(); SKILLS=(); CERTS=(); EXPS=()

command -v curl >/dev/null || { echo "missing curl (nix-shell -p curl jq mongosh --run bash)"; exit 2; }
command -v jq   >/dev/null || { echo "missing jq (nix-shell -p curl jq mongosh --run bash)"; exit 2; }
[ -f "$IMG" ] || { echo "image not found: $IMG (set DIR=...)"; exit 2; }

# ---------- helpers ----------
section() { printf "\n== %s ==\n" "$1"; }
check() { # name expected actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); printf "  PASS  %s\n" "$1"
  else FAIL=$((FAIL+1)); FAILS+=("$1   want='$2' got='$3'"); printf "  FAIL  %s   want='%s' got='%s'\n" "$1" "$2" "$3"; fi
}
skip() { SKIPPED=$((SKIPPED+1)); printf "  SKIP  %s\n" "$1"; }
die() { echo "ABORT: $1"; exit 3; }
hc()   { curl -s -o /dev/null -w "%{http_code}" "$@"; }
j()    { jq -r "$@"; }
get()  { curl -s "$API/$1"; }
adm()  { curl -s "$API/$1" "${AUTH[@]}"; }
put_json()  { curl -s -X PUT  "$API/$1" "${AUTH[@]}" "${JSON[@]}" -d "$2"; }
post_json() { curl -s -X POST "$API/$1" "${AUTH[@]}" "${JSON[@]}" -d "$2"; }
pcode() { hc -X "$1" "$API/$2" "${AUTH[@]}" "${JSON[@]}" -d "$3"; }   # method path json
differ() { [ "$1" != "$2" ] && echo differ || echo same; }

CLD=0
if [ -n "${CLOUDINARY_API_KEY:-}" ] && [ -n "${CLOUDINARY_API_SECRET:-}" ] && [ -n "${CLOUDINARY_CLOUD_NAME:-}" ]; then CLD=1; fi
pid_of() { printf %s "$1" | jq -Rr 'capture("upload/(v[0-9]+/)?(?<p>.*)\\.[a-zA-Z0-9]+$").p'; }
cld_version() { # public id -> current Cloudinary version, or "gone"
  curl -s -u "$CLOUDINARY_API_KEY:$CLOUDINARY_API_SECRET" \
    "https://api.cloudinary.com/v1_1/$CLOUDINARY_CLOUD_NAME/resources/image/upload/$(printf %s "$1" | jq -sRr @uri)" | jq -r '.version // "gone"'
}

cleanup() {
  section "cleanup"
  for id in "${PROJECTS[@]:-}"; do [ -n "$id" ] && curl -s -o /dev/null -X DELETE "$API/projects/$id" "${AUTH[@]}"; done
  for id in "${EXPS[@]:-}";     do [ -n "$id" ] && curl -s -o /dev/null -X DELETE "$API/experiences/$id" "${AUTH[@]}"; done
  for id in "${CERTS[@]:-}";    do [ -n "$id" ] && curl -s -o /dev/null -X DELETE "$API/certificates/$id" "${AUTH[@]}"; done
  for id in "${SKILLS[@]:-}";   do [ -n "$id" ] && curl -s -o /dev/null -X DELETE "$API/skills/$id" "${AUTH[@]}"; done
  for id in "${PEOPLE[@]:-}";   do [ -n "$id" ] && curl -s -o /dev/null -X DELETE "$API/people/$id" "${AUTH[@]}"; done
  echo "  leftovers (should be empty):"
  curl -s "$API/people" | jq -r --arg t "$T" '.data[]? | select(.name|test($t)) | "    person: "+.name'
  curl -s "$API/skills" | jq -r --arg t "$T" '.data[]? | select(.name|test($t)) | "    skill: "+.name'
  curl -s "$API/certificates" | jq -r --arg t "$T" '.data[]? | select(.title|test($t)) | "    certificate: "+.title'
  curl -s "$API/admin/projects" "${AUTH[@]}" | jq -r --arg t "$T" '.data[]? | select(.slug|test($t)) | "    project: "+.slug'
  rm -rf "$TMP"
  echo
  echo "================ RESULT: $PASS passed, $FAIL failed, $SKIPPED skipped ================"
  if [ "$FAIL" -gt 0 ]; then printf '  FAILED: %s\n' "${FAILS[@]}"; fi
  echo "Cloudinary leftovers to remove by hand: portfolio/projects/zz-reg*-$T*, portfolio/people/zz-*, portfolio/skills/zz-*, portfolio/certificate/*zz_*"
  [ "$FAIL" -eq 0 ] || exit 1
}
trap cleanup EXIT

# ---------- preflight ----------
section "preflight"
[ "$(curl -s "$API/health" | j '.status')" = "healthy" ] || die "server not reachable at $API (start it with ADMIN_SECRET=$ADMIN_SECRET npm run dev)"
check "admin auth accepted" "200" "$(hc "$API/admin/projects" "${AUTH[@]}")"
check "no credentials rejected" "401" "$(hc -X POST "$API/projects")"
check "CORS: unknown origin blocked" "403" "$(hc -H 'Origin: https://evil.example' "$API/health")"
check "CORS: no Origin header allowed" "200" "$(hc "$API/health")"
[ "$CLD" = 1 ] && echo "  (Cloudinary admin checks enabled)" || echo "  (no CLOUDINARY_* env: asset-version checks will be skipped)"

# ---------- people ----------
section "people (renamed collection)"
mkperson() { post_json people "{\"name\":\"$1\",\"profilePicUrl\":\"https://example.com/$2.png\"}" | j '.data._id'; }
P1=$(mkperson "Zz One $T" one); P2=$(mkperson "Zz Two $T" two); PEOPLE+=("$P1" "$P2")
check "people created" "24 24" "${#P1} ${#P2}"
check "old /contributors path is gone" "404" "$(hc "$API/contributors")"
check "duplicate name, case-insensitive" "409" "$(pcode POST people "{\"name\":\"zz one $T\",\"profilePicUrl\":\"https://example.com/x.png\"}")"
check "non-string name rejected" "400" "$(pcode POST people '{"name":42,"profilePicUrl":"https://example.com/x.png"}')"
check "null name on update rejected" "400" "$(pcode PUT people/$P1 '{"name":null}')"
bad=0; for v in 'javascript:alert(1)' 'data:text/html,x' '//example.com/x.png' 'http:example.com'; do
  c=$(pcode POST people "$(jq -nc --arg n "Zz Bad $T" --arg v "$v" '{name:$n,profilePicUrl:$v}')"); [ "$c" = 400 ] || bad=$((bad+1)); done
check "bad picture URLs rejected (4 forms)" "0" "$bad"
put_json people/$P1 '{"profileLink":"https://example.com/me"}' >/dev/null
put_json people/$P1 '{"profileLink":""}' >/dev/null
check "profileLink cleared to null" "null" "$(get people/$P1 | j '.data.profileLink // "null"')"
c=$(get people/$P1 | j '.data.name'); check "person name unchanged after clears" "Zz One $T" "$c"

# ---------- project ----------
section "project basics"
SLUG="zz-reg-$T"
PID=$(curl -s -X POST "$API/projects" "${AUTH[@]}" -F "title=Zz Reg $T" -F "slug=$SLUG" -F "category=testing" -F "description=regression run" -F "image=@$IMG;type=image/jpeg" | j '.data._id')
PROJECTS+=("$PID")
[ "${#PID}" = 24 ] || die "could not create the test project (is Cloudinary configured?)"
check "project created" "24" "${#PID}"
check "defaults: host, forkedFrom, gallery, hostedBy" '["self",null,0,[]]' "$(get projects/$SLUG | jq -c '[.data.host,.data.forkedFrom,(.data.gallery|length),.data.hostedBy]')"
check "versions payload accepted but ignored on PUT" "200" "$(pcode PUT projects/$PID '{"versions":[{"versionTag":"x","gallery":[{"url":"javascript:alert(1)"}]}]}')"
check "no version stored from that payload" "0" "$(get projects/$SLUG | j '.data.versions|length')"

put_json projects/$PID '{"githubLink":"https://github.com/x/y","deployedLink":"https://example.com","videoDemo":"https://example.com/v.mp4","forkedFrom":"https://github.com/up/stream"}' >/dev/null
check "links and forkedFrom stored" '["https://github.com/x/y","https://example.com","https://example.com/v.mp4","https://github.com/up/stream"]' "$(get projects/$SLUG | jq -c '[.data.githubLink,.data.deployedLink,.data.videoDemo,.data.forkedFrom]')"
check "?forked=true includes it" "1" "$(get 'projects?forked=true' | j --arg s "$SLUG" '[.data[]|select(.slug==$s)]|length')"
put_json projects/$PID '{"githubLink":"","deployedLink":"","videoDemo":"","forkedFrom":""}' >/dev/null
check "empty strings clear to null (read back)" '[null,null,null,null]' "$(get projects/$SLUG | jq -c '[.data.githubLink,.data.deployedLink,.data.videoDemo,.data.forkedFrom]')"
check "?forked=false includes it" "1" "$(get 'projects?forked=false' | j --arg s "$SLUG" '[.data[]|select(.slug==$s)]|length')"
check "?forked=nope rejected" "400" "$(hc "$API/projects?forked=nope")"
bad=0; for f in githubLink deployedLink forkedFrom videoDemo image; do
  for v in 'javascript:alert(1)' 'data:text/html,x' 'ftp://example.com/a' '//example.com/a' 'http:example.com'; do
    c=$(pcode PUT projects/$PID "$(jq -nc --arg f "$f" --arg v "$v" '{($f):$v}')"); [ "$c" = 400 ] || { bad=$((bad+1)); echo "    not rejected: $f = $v ($c)"; }
  done; done
check "bad URL schemes rejected on 5 project fields" "0" "$bad"
check "threeDModel null is a 400, not a 500" "400" "$(pcode PUT projects/$PID '{"threeDModel":null}')"
check "threeDModel.fileUrl non-string rejected" "400" "$(pcode PUT projects/$PID '{"threeDModel":{"fileUrl":123}}')"

# ---------- contributors + host ----------
section "contributors and host"
put_json projects/$PID "{\"contributors\":[{\"contributor\":\"$P1\",\"role\":\"  designer  \"},\"$P2\"]}" >/dev/null
check "contributor roles (trimmed, bare id = null)" '["designer",null]' "$(get projects/$SLUG | jq -c '[.data.contributors[].role]')"
check "contributors are flat objects" "true" "$(get projects/$SLUG | jq '.data.contributors[0] | has("_id") and has("name") and has("profilePicUrl")')"
put_json projects/$PID "{\"host\":\"people\",\"hostedBy\":[\"$P1\",\"$P2\"]}" >/dev/null
check "host=people with two hosts" "[\"people\",[\"$P1\",\"$P2\"]]" "$(get projects/$SLUG | jq -c '[.data.host,(.data.hostedBy|map(._id))]')"
check "host nope" "400" "$(pcode PUT projects/$PID '{"host":"nope"}')"
check "people needs at least one host" "400" "$(pcode PUT projects/$PID '{"hostedBy":[]}')"
check "self with hosts" "400" "$(pcode PUT projects/$PID "{\"host\":\"self\",\"hostedBy\":[\"$P1\"]}")"
check "unknown host id" "400" "$(pcode PUT projects/$PID '{"hostedBy":["000000000000000000000000"]}')"
check "invalid host id" "400" "$(pcode PUT projects/$PID '{"hostedBy":["not-an-id"]}')"
check "duplicate host id" "400" "$(pcode PUT projects/$PID "{\"hostedBy\":[\"$P1\",\"$P1\"]}")"
check "hosts unchanged after rejected requests" "[\"people\",[\"$P1\",\"$P2\"]]" "$(get projects/$SLUG | jq -c '[.data.host,(.data.hostedBy|map(._id))]')"
put_json projects/$PID '{"host":"self"}' >/dev/null
check "switching to self clears hosts" '["self",0]' "$(get projects/$SLUG | jq -c '[.data.host,(.data.hostedBy|length)]')"
check "hosts without host=people rejected" "400" "$(pcode PUT projects/$PID "{\"hostedBy\":[\"$P1\"]}")"
put_json projects/$PID "{\"host\":\"people\",\"hostedBy\":[\"$P1\"]}" >/dev/null
check "?host=people lists it" "1" "$(get 'projects?host=people' | j --arg s "$SLUG" '[.data[]|select(.slug==$s)]|length')"
check "?host=self excludes it" "0" "$(get 'projects?host=self' | j --arg s "$SLUG" '[.data[]|select(.slug==$s)]|length')"
check "?host=nope rejected" "400" "$(hc "$API/projects?host=nope")"
check "admin list ?host=people lists it" "1" "$(adm 'admin/projects?host=people' | j --arg s "$SLUG" '[.data[]|select(.slug==$s)]|length')"
UP=$(printf %s "$P1" | tr 'a-f' 'A-F')
check "delete person in use (host + contributor) -> 409" "409" "$(hc -X DELETE "$API/people/$P1" "${AUTH[@]}")"
check "delete with UPPERCASE id still -> 409" "409" "$(hc -X DELETE "$API/people/$UP" "${AUTH[@]}")"
check "delete person used only as contributor -> 409" "409" "$(hc -X DELETE "$API/people/$P2" "${AUTH[@]}")"

# ---------- versions ----------
section "versions"
vid() { jq -r --arg t "$1" '.data.versions[]|select(.versionTag==$t)|._id'; }
V1=$(curl -s -X POST "$API/projects/$SLUG/versions" "${AUTH[@]}" -F "versionTag=v1.0.0" --form-string 'changelog=["a","b"]' -F "isLatest=true" -F "image=@$IMG;type=image/jpeg" | vid v1.0.0)
V2=$(curl -s -X POST "$API/projects/$SLUG/versions" "${AUTH[@]}" -F "versionTag=v2.0.0" -F "isLatest=false" | vid v2.0.0)
check "versions created" "24 24" "${#V1} ${#V2}"
check "changelog parsed from multipart JSON string" '["a","b"]' "$(get projects/$SLUG | jq -c '.data.versions[]|select(.versionTag=="v1.0.0")|.changelog')"
check 'isLatest "false" stays false; v1 stays latest' '{"v1.0.0":true,"v2.0.0":false}' "$(get projects/$SLUG | jq -c '[.data.versions[]|{(.versionTag):.isLatest}]|add')"
check "new version defaults: status planning, no startDate" '["planning",null]' "$(get projects/$SLUG | jq -c '.data.versions[]|select(.versionTag=="v2.0.0")|[.status,.startDate]')"
check 'isLatest "yes" rejected on create' "400" "$(hc -X POST "$API/projects/$SLUG/versions" "${AUTH[@]}" -F "versionTag=lat-bad" -F "isLatest=yes")"
check 'isLatest "maybe" rejected on update' "400" "$(pcode PUT projects/$SLUG/versions/$V1 '{"isLatest":"maybe"}')"
check "rejected requests did not clear the latest flag" "true" "$(get projects/$SLUG | j '.data.versions[]|select(._id=="'$V1'")|.isLatest')"
check "duplicate tag, case-insensitive" "409" "$(hc -X POST "$API/projects/$SLUG/versions" "${AUTH[@]}" -F "versionTag=V1.0.0")"
check "non-string image on version create" "400" "$(pcode POST projects/$SLUG/versions '{"versionTag":"bad-img","image":123}')"
put_json projects/$SLUG/versions/$V1 '{"status":"active","startDate":"2026-01-10","endDate":"2026-03-01","deployedLink":"https://example.com/live","githubLink":"https://github.com/x/y","demoUrl":"https://example.com/demo","socialLinks":[{"platform":"web","url":"https://example.com"}]}' >/dev/null
check "version metadata stored" '["active","https://example.com/live","https://github.com/x/y","https://example.com/demo",1]' "$(get projects/$SLUG | jq -c '.data.versions[]|select(._id=="'$V1'")|[.status,.deployedLink,.githubLink,.demoUrl,(.socialLinks|length)]')"
check "end before start rejected" "400" "$(pcode PUT projects/$SLUG/versions/$V1 '{"startDate":"2026-05-01","endDate":"2026-04-01"}')"
check 'status "" rejected' "400" "$(pcode PUT projects/$SLUG/versions/$V1 '{"status":""}')"
check "version deployedLink javascript:" "400" "$(pcode PUT projects/$SLUG/versions/$V1 '{"deployedLink":"javascript:alert(1)"}')"
check "version demoUrl non-string" "400" "$(pcode PUT projects/$SLUG/versions/$V1 '{"demoUrl":123}')"
check "version threeDModel.fileUrl javascript:" "400" "$(pcode PUT projects/$SLUG/versions/$V1 '{"threeDModel":{"fileUrl":"javascript:alert(1)"}}')"
put_json projects/$SLUG/versions/$V1 '{"demoUrl":"","deployedLink":"","githubLink":"","startDate":"","endDate":""}' >/dev/null
check "version fields cleared (read back)" '[null,null,null,null,null]' "$(get projects/$SLUG | jq -c '.data.versions[]|select(._id=="'$V1'")|[(.demoUrl//null),(.deployedLink//null),(.githubLink//null),(.startDate//null),(.endDate//null)]')"

section "version host (inherit / override)"
eff() { get projects/$SLUG | jq -c '.data.versions[]|select(._id=="'$V1'")|[.host,.effectiveHost,(.effectiveHostedBy|map(._id))]'; }
check "inherits the project's host" "[null,\"people\",[\"$P1\"]]" "$(eff)"
put_json projects/$SLUG/versions/$V1 "{\"host\":\"people\",\"hostedBy\":[\"$P2\"]}" >/dev/null
check "override with another host" "[\"people\",\"people\",[\"$P2\"]]" "$(eff)"
put_json projects/$SLUG/versions/$V1 '{"host":"self","hostedBy":[]}' >/dev/null
check "override to self" '["self","self",[]]' "$(eff)"
check "self override with hosts rejected" "400" "$(pcode PUT projects/$SLUG/versions/$V1 "{\"host\":\"self\",\"hostedBy\":[\"$P1\"]}")"
put_json projects/$SLUG/versions/$V1 '{"host":""}' >/dev/null
check "empty string clears the override" "[null,\"people\",[\"$P1\"]]" "$(eff)"
check "hostedBy without host rejected" "400" "$(pcode PUT projects/$SLUG/versions/$V1 "{\"hostedBy\":[\"$P1\"]}")"
put_json projects/$SLUG/versions/$V1 "{\"host\":\"people\",\"hostedBy\":[\"$P2\"]}" >/dev/null
put_json projects/$SLUG/versions/$V1 '{"host":null}' >/dev/null
check "null clears the override" "[null,\"people\",[\"$P1\"]]" "$(eff)"
put_json projects/$PID '{"host":"self"}' >/dev/null
check "inheriting version follows the project (self)" '[null,"self",[]]' "$(eff)"
put_json projects/$PID "{\"host\":\"people\",\"hostedBy\":[\"$P1\"]}" >/dev/null

# ---------- project gallery ----------
section "project gallery"
gcount() { get projects/$SLUG | j '.data.gallery|length'; }
curl -s -X POST "$API/projects/$SLUG/gallery" "${AUTH[@]}" \
  -F "galleryImages=@$IMG;type=image/jpeg" -F "galleryImages=@$IMG;type=image/jpeg" -F "galleryImages=@$IMG;type=image/jpeg" \
  --form-string 'galleryMeta=[{"tags":["cert","AWS"],"caption":"  AWS cert  "},{"tags":["demo"]},{"tags":["cred","demo"],"caption":"c"}]' >/dev/null
check "3 uploaded images stored" "3" "$(gcount)"
check "tags normalized, caption trimmed, aligned to files" '[["cert","aws"],"AWS cert"]' "$(get projects/$SLUG | jq -c '[.data.gallery[0].tags,.data.gallery[0].caption]')"
check "3 distinct Cloudinary files" "3" "$(get projects/$SLUG | j '[.data.gallery[].url]|unique|length')"
check "files are under /gallery/" "3" "$(get projects/$SLUG | j '.data.gallery[].url' | grep -c '/gallery/' || true)"
post_json projects/$SLUG/gallery '{"items":[{"url":"https://example.com/a.png","tags":["Wip Shot"],"caption":"  from url  "}]}' >/dev/null
check "URL-based add: tag/caption normalized" '[["wip-shot"],"from url"]' "$(get projects/$SLUG | jq -c '.data.gallery[-1]|[.tags,.caption]')"
check "javascript: gallery url" "400" "$(pcode POST projects/$SLUG/gallery '{"items":[{"url":"javascript:alert(1)"}]}')"
check "files and items together" "400" "$(hc -X POST "$API/projects/$SLUG/gallery" "${AUTH[@]}" -F "galleryImages=@$IMG;type=image/jpeg" --form-string 'items=[{"url":"https://example.com/x.png"}]')"
check "non-image file rejected" "400" "$(hc -X POST "$API/projects/$SLUG/gallery" "${AUTH[@]}" -F "galleryImages=@$GLB;type=model/gltf-binary")"
FILES=(); for i in $(seq 1 11); do FILES+=(-F "galleryImages=@$IMG;type=image/jpeg"); done
check "11 files in one request rejected" "400" "$(hc -X POST "$API/projects/$SLUG/gallery" "${AUTH[@]}" "${FILES[@]}")"
check "rejected requests added nothing" "4" "$(gcount)"
G0=$(get projects/$SLUG | j '.data.gallery[0]._id')
check "tag with invalid characters" "400" "$(pcode PUT projects/$SLUG/gallery/$G0 '{"tags":["a<b>"]}')"
check "9 tags" "400" "$(pcode PUT projects/$SLUG/gallery/$G0 '{"tags":["a","b","c","d","e","f","g","h","i"]}')"
check "caption over 200 chars" "400" "$(pcode PUT projects/$SLUG/gallery/$G0 "{\"caption\":\"$(printf 'x%.0s' $(seq 1 201))\"}")"
curl -s -X PUT "$API/projects/$SLUG/gallery/$G0" "${AUTH[@]}" -F "tags=demo,live,v2" >/dev/null
check "comma-separated tags accepted" '["demo","live","v2"]' "$(get projects/$SLUG | jq -c '.data.gallery[0].tags')"
put_json projects/$SLUG/gallery/$G0 '{"caption":"only caption"}' >/dev/null
check "omitted tags stay unchanged" '[["demo","live","v2"],"only caption"]' "$(get projects/$SLUG | jq -c '.data.gallery[0]|[.tags,.caption]')"
put_json projects/$SLUG/gallery/$G0 '{"tags":[],"caption":""}' >/dev/null
check "tags and caption cleared" '[[],""]' "$(get projects/$SLUG | jq -c '.data.gallery[0]|[.tags,.caption]')"
LAST_BEFORE=$(get projects/$SLUG | j '.data.gallery[-1]._id')
put_json projects/$SLUG/gallery/order "$(get projects/$SLUG | jq -c '{order:([.data.gallery[]._id]|reverse)}')" >/dev/null
check "reorder (reverse) applied" "$LAST_BEFORE" "$(get projects/$SLUG | j '.data.gallery[0]._id')"
check "reorder with a missing id" "400" "$(pcode PUT projects/$SLUG/gallery/order "$(get projects/$SLUG | jq -c '{order:([.data.gallery[]._id]|.[:-1])}')")"
check "reorder with a duplicate id" "400" "$(pcode PUT projects/$SLUG/gallery/order "$(get projects/$SLUG | jq -c '{order:([.data.gallery[]._id]|(.[:-1]+[.[0]]))}')")"
check "gallery fields on PUT /projects/:id are rejected" "400" "$(hc -X PUT "$API/projects/$PID" "${AUTH[@]}" -F "galleryImages=@$IMG;type=image/jpeg")"
check "gallery unchanged after that" "4" "$(gcount)"

for round in 1 2 3; do
  before=$(gcount); rm -f "$TMP/adds"
  for i in 1 2 3 4 5; do
    ( c=$(hc -X POST "$API/projects/$SLUG/gallery" "${AUTH[@]}" "${JSON[@]}" -d "{\"items\":[{\"url\":\"https://example.com/p$round-$i.png\"}]}"); echo "$c" >> "$TMP/adds" ) &
  done
  ( hc -X PUT "$API/projects/$SLUG/gallery/order" "${AUTH[@]}" "${JSON[@]}" -d "$(get projects/$SLUG | jq -c '{order:([.data.gallery[]._id]|reverse)}')" >/dev/null ) &
  wait
  okadds=$(grep -c '^201$' "$TMP/adds" || true); after=$(gcount)
  check "reorder racing 5 adds lost nothing (round $round)" "$((before+okadds))" "$after"
done

# info only: is there a per-request limit on URL items? (the earlier big single request got a 400)
resp=$(curl -s -w '\n%{http_code}' -X POST "$API/projects/$SLUG/gallery" "${AUTH[@]}" "${JSON[@]}" -d "$(jq -nc '{items:[range(0;11)|{url:"https://example.com/probe\(.).png"}]}')")
echo "  info: server said: $(printf '%s' "$resp" | head -n -1 | jq -r '.message // empty' 2>/dev/null)"
check "11 URL items in ONE request rejected (limit is 10 per request)" "400" "$(printf '%s' "$resp" | tail -n1)"
fill_cap() { # post-path count-function  (adds URL items in batches of at most 10 until the gallery holds 30)
  local path="$1" cnt="$2" c n codes=""
  c=$($cnt)
  for _ in 1 2 3 4; do
    [ "${c:-0}" -ge 30 ] && break
    n=$((30-c)); [ "$n" -gt 10 ] && n=10
    codes="$codes $(pcode POST "$path" "$(jq -nc --argjson n "$n" --arg p "$RANDOM$RANDOM" '{items:[range(0;$n)|{url:"https://example.com/fill\($p)-\(.).png"}]}')")"
    c=$($cnt)
  done
  FILL_CODES="$codes"
  echo "  info: fill batches ->$codes (count now $c)"
}
fill_ok() { local nb=0 x; for x in $FILL_CODES; do [ "$x" = 201 ] || nb=$((nb+1)); done; echo "$nb"; }
fill_cap "projects/$SLUG/gallery" gcount
check "every fill batch (up to 10 items) accepted" "0" "$(fill_ok)"
check "project gallery reached the 30-item cap" "30" "$(gcount)"
check "31st item rejected" "400" "$(pcode POST projects/$SLUG/gallery '{"items":[{"url":"https://example.com/one-more.png"}]}')"
check "project gallery stays at 30" "30" "$(gcount)"
GD=$(get projects/$SLUG | j '.data.gallery[-1]._id')
check "delete one gallery item" "200" "$(hc -X DELETE "$API/projects/$SLUG/gallery/$GD" "${AUTH[@]}")"
check "count after delete" "29" "$(gcount)"

# ---------- version gallery ----------
section "version gallery"
GID=$(post_json projects/$SLUG/versions/$V1/gallery '{"items":[{"url":"https://example.com/g.png","tags":["Demo Shot"]}]}' | jq -r '.data.versions[]|select(._id=="'$V1'")|.gallery[-1]._id')
check "version gallery item added (tag normalized)" '["demo-shot"]' "$(get projects/$SLUG | jq -c '.data.versions[]|select(._id=="'$V1'")|.gallery[-1].tags')"
check "image of V1 addressed under V2: PUT -> 404" "404" "$(pcode PUT projects/$SLUG/versions/$V2/gallery/$GID '{"caption":"x"}')"
check "image of V1 addressed under V2: DELETE -> 404" "404" "$(hc -X DELETE "$API/projects/$SLUG/versions/$V2/gallery/$GID" "${AUTH[@]}")"
check "V1 still has its image" "1" "$(get projects/$SLUG | j '.data.versions[]|select(._id=="'$V1'")|.gallery|length')"
V3=$(post_json projects/$SLUG/versions '{"versionTag":"par"}' | vid par)
for i in 1 2 3 4; do
  curl -s -o /dev/null -X POST "$API/projects/$SLUG/versions/$V3/gallery" "${AUTH[@]}" -F "galleryImages=@$IMG;type=image/jpeg" &
done
curl -s -o /dev/null -X POST "$API/projects/$SLUG/versions/$V3/gallery" "${AUTH[@]}" -F "versionTag=evil" -F "galleryImages=@$IMG;type=image/jpeg" &
wait
URLS=$(get projects/$SLUG | jq -r '.data.versions[]|select(._id=="'$V3'")|.gallery[].url')
check "5 parallel uploads all stored" "5" "$(printf '%s\n' "$URLS" | grep -c . || true)"
check "5 distinct Cloudinary files" "5" "$(printf '%s\n' "$URLS" | sort -u | grep -c . || true)"
check "folder uses the STORED tag (par), not the body's" "5 0" "$(printf '%s %s' "$(printf '%s\n' "$URLS" | grep -c '/par/gallery/' || true)" "$(printf '%s\n' "$URLS" | grep -c '/evil/' || true)")"
vcount() { get projects/$SLUG | j '.data.versions[]|select(._id=="'$V3'")|.gallery|length'; }
fill_cap "projects/$SLUG/versions/$V3/gallery" vcount
check "every version fill batch (up to 10 items) accepted" "0" "$(fill_ok)"
check "version gallery reached the 30-item cap" "30" "$(vcount)"
check "31st version item rejected" "400" "$(pcode POST projects/$SLUG/versions/$V3/gallery '{"items":[{"url":"https://example.com/more.png"}]}')"
check "version gallery stays at 30" "30" "$(vcount)"

# ---------- creation-time gallery + legacy ----------
section "creation-time gallery"
SLUG2="zz-reg2-$T"
PID2=$(curl -s -X POST "$API/projects" "${AUTH[@]}" -F "title=Zz Reg2 $T" -F "slug=$SLUG2" -F "category=testing" -F "description=tmp" \
  -F "image=@$IMG;type=image/jpeg" -F "galleryImages=@$IMG;type=image/jpeg" --form-string 'galleryMeta=[{"tags":["cover-alt"],"caption":"made at creation"}]' \
  --form-string 'versions=[{"versionTag":"x","gallery":[{"url":"javascript:alert(1)"}]}]' | j '.data._id')
PROJECTS+=("$PID2")
check "project created with a gallery in one request" '[1,["cover-alt"],0]' "$(get projects/$SLUG2 | jq -c '[(.data.gallery|length),.data.gallery[0].tags,(.data.versions|length)]')"
if command -v mongosh >/dev/null && [ -n "${MONGO_URI:-}" ]; then
  mongosh "$MONGO_URI" --quiet --eval 'db.getSiblingDB("about_core").projects.updateOne({slug:"'"$SLUG2"'"},{$unset:{host:"",hostedBy:"",forkedFrom:"",gallery:""}})' >/dev/null
  check "old document (fields missing in MongoDB) reads with defaults" '["self",[],null,[]]' "$(get projects/$SLUG2 | jq -c '[.data.host,.data.hostedBy,.data.forkedFrom,.data.gallery]')"
  check "old document matches ?host=self" "1" "$(get 'projects?host=self' | j --arg s "$SLUG2" '[.data[]|select(.slug==$s)]|length')"
  check "old document matches ?forked=false" "1" "$(get 'projects?forked=false' | j --arg s "$SLUG2" '[.data[]|select(.slug==$s)]|length')"
else
  skip "legacy-document checks (needs mongosh and MONGO_URI)"
fi

# ---------- skills ----------
section "skills (public ids)"
mks() { curl -s -X POST "$API/skills" "${AUTH[@]}" -F "name=$1" -F "logoUrl=@$IMG;type=image/jpeg" | j '.data._id'; }
S1=$(mks "Zz Sk1 $T"); S2=$(mks "Zz Sk2 $T"); SKILLS+=("$S1" "$S2")
check "skills created" "24 24" "${#S1} ${#S2}"
u1=$(curl -s -X PUT "$API/skills/$S1" "${AUTH[@]}" -F "logoUrl=@$IMG;type=image/jpeg" | j '.data.logoUrl')
u2=$(curl -s -X PUT "$API/skills/$S2" "${AUTH[@]}" -F "logoUrl=@$IMG;type=image/jpeg" | j '.data.logoUrl')
check "logos differ when the name is omitted on update" "differ" "$(differ "$u1" "$u2")"
check "not the shared /skills/skill/skill file" "0" "$(printf '%s\n%s\n' "$u1" "$u2" | grep -c '/skills/skill/skill' || true)"
if [ "$CLD" = 1 ]; then
  p=$(pid_of "$u1"); vb=$(cld_version "$p"); sleep 1
  check "duplicate-name POST with a file" "409" "$(hc -X POST "$API/skills" "${AUTH[@]}" -F "name=zz sk1 $T" -F "logoUrl=@$IMG;type=image/jpeg")"
  sleep 2; check "existing logo untouched in Cloudinary" "$vb" "$(cld_version "$p")"
else skip "Cloudinary version check for skills"; fi

# ---------- people pictures (uploads) ----------
section "people pictures (uploads, public ids)"
mkpu() { curl -s -X POST "$API/people" "${AUTH[@]}" -F "name=$1" -F "profilePicUrl=@$IMG;type=image/jpeg" | j '.data._id'; }
PU1=$(mkpu "Zz Pic1 $T"); PU2=$(mkpu "Zz Pic2 $T"); PEOPLE+=("$PU1" "$PU2")
check "people with uploaded pictures created" "24 24" "${#PU1} ${#PU2}"
pu1=$(curl -s -X PUT "$API/people/$PU1" "${AUTH[@]}" -F "profilePicUrl=@$IMG;type=image/jpeg" | j '.data.profilePicUrl')
pu2=$(curl -s -X PUT "$API/people/$PU2" "${AUTH[@]}" -F "profilePicUrl=@$IMG;type=image/jpeg" | j '.data.profilePicUrl')
check "pictures differ when the name is omitted on update" "differ" "$(differ "$pu1" "$pu2")"
check "not a shared fallback file" "0" "$(printf '%s\n%s\n' "$pu1" "$pu2" | grep -cE '/(contributors/contributor|people/person)/' || true)"
check "pictures are under portfolio/people/" "2" "$(printf '%s\n%s\n' "$pu1" "$pu2" | grep -c '/portfolio/people/' || true)"
if [ "$CLD" = 1 ]; then
  p=$(pid_of "$pu1"); vb=$(cld_version "$p"); sleep 1
  check "duplicate-name person POST with a file" "409" "$(hc -X POST "$API/people" "${AUTH[@]}" -F "name=zz pic1 $T" -F "profilePicUrl=@$IMG;type=image/jpeg")"
  sleep 2; check "existing person picture untouched in Cloudinary" "$vb" "$(cld_version "$p")"
else skip "Cloudinary version check for people pictures"; fi

# ---------- certificates ----------
section "certificates"
C1=$(curl -s -X POST "$API/certificates" "${AUTH[@]}" -F "title=Zz Cert $T" -F "organization=Zz Org" -F "description=t" -F "link=https://example.com/c" -F "mediaUrl=@$IMG;type=image/jpeg" | j '.data._id')
CERTS+=("$C1")
check "certificate created" "24" "${#C1}"
curl -s -X PUT "$API/certificates/$C1" "${AUTH[@]}" "${JSON[@]}" -d '{"link":""}' >/dev/null
check "certificate link cleared (read back)" "null" "$(get certificates/$C1 | j '.data.link // "null"')"
check "certificate link javascript:" "400" "$(pcode PUT certificates/$C1 '{"link":"javascript:alert(1)"}')"
if [ "$CLD" = 1 ]; then
  p=$(pid_of "$(get certificates/$C1 | j '.data.mediaUrl')"); vb=$(cld_version "$p")
  codes=""; for i in 1 2 3; do codes="$codes $(hc -X POST "$API/certificates" "${AUTH[@]}" -F "title=zz cert $T" -F "organization=Zz Org" -F "description=t" -F "mediaUrl=@$IMG;type=image/jpeg")"; done
  check "3 back-to-back duplicate-title uploads" "409 409 409" "$(echo $codes)"
  sleep 3; check "existing certificate image untouched in Cloudinary" "$vb" "$(cld_version "$p")"
else skip "Cloudinary version check for certificates"; fi

# ---------- rollback of rejected uploads ----------
section "rollback of rejected multipart requests (Cloudinary)"
if [ "$CLD" = 1 ]; then
  cldlist() { curl -s -u "$CLOUDINARY_API_KEY:$CLOUDINARY_API_SECRET" "https://api.cloudinary.com/v1_1/$CLOUDINARY_CLOUD_NAME/resources/image?type=upload&prefix=$1&max_results=500" | jq -r '.resources[]?.public_id' | sort; }
  pre="portfolio/projects/$SLUG"
  b=$(cldlist "$pre" | grep -c . || true)
  check "PUT /projects/:id with a bad link + image file" "400" "$(hc -X PUT "$API/projects/$PID" "${AUTH[@]}" -F "githubLink=javascript:alert(1)" -F "image=@$IMG;type=image/jpeg")"
  check "gallery add with a bad tag + image file" "400" "$(hc -X POST "$API/projects/$SLUG/gallery" "${AUTH[@]}" -F "galleryImages=@$IMG;type=image/jpeg" --form-string 'galleryMeta=[{"tags":["bad<tag>"]}]')"
  check "duplicate version tag + image file" "409" "$(hc -X POST "$API/projects/$SLUG/versions" "${AUTH[@]}" -F "versionTag=V1.0.0" -F "image=@$IMG;type=image/jpeg")"
  check "version update with a bad link + image file" "400" "$(hc -X PUT "$API/projects/$SLUG/versions/$V1" "${AUTH[@]}" -F "deployedLink=javascript:alert(1)" -F "image=@$IMG;type=image/jpeg")"
  sleep 5
  a=$(cldlist "$pre" | grep -c . || true)
  check "rejected requests left no files in Cloudinary" "$b" "$a"
else skip "Cloudinary rollback check (needs CLOUDINARY_* in .env)"; fi

# ---------- experiences ----------
section "experiences"
EB="{\"organization\":\"Zz Exp $T\",\"tag\":\"focus\",\"type\":\"club\",\"iconUrl\":\"https://example.com/i.png\""
check "positions [null]" "400" "$(pcode POST experiences "$EB,\"positions\":[null]}")"
check 'positions "null"' "400" "$(pcode POST experiences "$EB,\"positions\":\"null\"}")"
check "experience iconUrl javascript:" "400" "$(pcode POST experiences "{\"organization\":\"Zz Exp2 $T\",\"tag\":\"focus\",\"type\":\"club\",\"iconUrl\":\"javascript:alert(1)\"}")"
for o in "Zz Exp $T" "Zz Exp2 $T"; do e=$(get experiences | j --arg o "$o" '.data[]?|select(.organization==$o)|._id'); [ -n "$e" ] && EXPS+=("$e"); done

# ---------- people: delete after release ----------
section "people: delete once released"
put_json projects/$PID '{"host":"self","contributors":[]}' >/dev/null
put_json projects/$SLUG/versions/$V1 '{"host":""}' >/dev/null
check "person deletable after references are removed" "200" "$(hc -X DELETE "$API/people/$P2" "${AUTH[@]}")"
check "other person deletable too" "200" "$(hc -X DELETE "$API/people/$P1" "${AUTH[@]}")"