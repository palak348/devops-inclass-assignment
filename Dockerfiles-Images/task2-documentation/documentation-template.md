# Docker Multi-Stage Build — Submission

**Name:** Palak Agrawal
**Enrollment Number:** 24BCS10504

---

## Task 1 — Multi-stage Dockerfile

### What a multi-stage build does

A multi-stage Dockerfile uses more than one `FROM` instruction. Each `FROM`
starts a new stage, and a later stage can copy files out of an earlier one
with `COPY --from`.

The point is that everything needed to *build* an application — compilers,
package managers, dev dependencies — is usually not needed to *run* it. A
multi-stage build keeps the build tools in a throwaway stage and copies only
the finished output into the final image.

### The Dockerfile used

```dockerfile
# ---------- Stage 1: build ----------
FROM node:18-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

# ---------- Stage 2: runtime ----------
FROM node:18-alpine AS runtime

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server.js ./server.js
COPY --from=build /app/package.json ./package.json

EXPOSE 3000

CMD ["node", "server.js"]
```

Stage 1 is named `build` with `AS build`. Stage 2 refers back to it with
`COPY --from=build`.

### Commands run

```bash
docker build -t multistage-app .
docker run -d --name multistage-container -p 8080:3000 multistage-app
```

The port mapping is `8080:3000` — host port 8080 to container port 3000, which
is the port `server.js` listens on.

### Application output

The application was accessed at `http://localhost:8080` and displayed the
expected message.

![App running](./screenshots/app-running.png)

*Output: `Hello World from Docker multi-stage build`*

### Running container (docker ps)

`docker ps` confirms the container is running and mapped to port 8080.

![docker ps output](./screenshots/docker-ps.png)

*Port mapping confirmed: `0.0.0.0:8080->3000/tcp`*

Reading that mapping: traffic arriving at port **8080** on my laptop is
forwarded to port **3000** inside the container. The application never changed
port — only the outside address did.

---

## Notes

- Base image (build stage): `node:18-alpine`
- Base image (runtime stage): `node:18-alpine`
- Host port: `8080` → Container port: `3000`
- Image name: `multistage-app`
- Container name: `multistage-container`

---

## Task 3 — Multiple application types deployed with Docker

Three different types of application were built and run at the same time, each
in its own container on its own port.

| Application | Base image | Host port | Verified with |
|---|---|---|---|
| Node.js | `node:18-alpine` | 3000 | `curl http://localhost:3000` |
| Python (Flask) | `python:3.12-slim` | 5000 | `curl http://localhost:5000` |
| Java | `eclipse-temurin:17-jre-alpine` | 8000 | `curl http://localhost:8000` |

Output from each:

```text
Hello from the Node.js Docker app!
Hello from the Python Docker app!
Hello from the Java Docker app!
```

![All containers running](./screenshots/docker-ps-all.png)

*All three containers running simultaneously, each on its own port, alongside
the multi-stage container on 8080.*

### What I understood from this

The three applications use completely different runtimes — a JavaScript
engine, a Python interpreter, and a Java Virtual Machine. Installing all three
on one machine directly would mean three sets of dependencies that can
conflict with each other.

In containers they do not interact at all. Each image carries its own runtime,
and the only thing they share is the host kernel. That is the practical
argument for containers: the Java app cannot break the Python app, because as
far as each is concerned the other does not exist.

The Java Dockerfile also uses a multi-stage build — `eclipse-temurin:17-jdk`
to compile with `javac`, then `eclipse-temurin:17-jre` to run. The JDK is only
needed to compile; the smaller JRE is enough to run the result.

---

## Summary

| Task | Requirement | Status |
|---|---|---|
| 1 | Build image from multi-stage Dockerfile | Done |
| 1 | Run container from the image | Done |
| 1 | Application displays the expected message | Done |
| 1 | `docker ps` confirms container on port 8080 | Done |
| 2 | Documentation with name and enrollment number | This file |
| 3 | Deploy 3 different application types | Node.js, Python, Java |
