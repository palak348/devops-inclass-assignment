# Session 8 — Docker Networking & Volumes

## Student Information

**Name:** Palak Agrawal
**Roll No.:** 24BCS10504

---

## Objective

The objective of this practical was to understand Docker networking and
volumes through hands-on exercises.

The exercises covered:

- Creating custom Docker bridge networks
- Connecting containers to different networks
- Testing container-to-container connectivity
- Using host networking
- Performing a bind mount
- Understanding overlay networks and their use cases

---

# 1. Creating Docker Networks

Three custom Docker bridge networks were created:

```bash
docker network create frontend-net
docker network create backend-net
docker network create db-net
```

The available Docker networks were then checked using:

```bash
docker network ls
```

The three custom networks were successfully created with the `bridge`
network driver.

### Screenshot

![alt text](images/network.png)

---

# 2. Creating Frontend, Backend and Database Containers

## Frontend Container

An Nginx Alpine container was created on the frontend network:

```bash
docker run -d --name frontend --network frontend-net nginx:alpine
```

## Backend Container

Another Nginx Alpine container was created on the backend network:

```bash
docker run -d --name backend --network backend-net nginx:alpine
```

The backend container was then connected to the frontend network:

```bash
docker network connect frontend-net backend
```

Later, it was also connected to the database network:

```bash
docker network connect db-net backend
```

Therefore, the backend container was connected to three networks:

```text
frontend-net
backend-net
db-net
```

This demonstrates how a container can communicate with different groups of
containers by being attached to multiple Docker networks.

## Database Container

A MySQL 8 container was created on the database network:

```bash
docker run -d \
  --name db \
  --network db-net \
  -e MYSQL_ROOT_PASSWORD=rootpass \
  mysql:8
```

---

# 3. Container Connectivity

## Frontend → Backend

Connectivity from the frontend container to the backend container was tested
using:

```bash
docker exec frontend wget -qO- http://backend
```

The command successfully returned the default Nginx HTML page.

This confirms that the frontend container could resolve the `backend`
container by its Docker network name and communicate with it.

## Backend → Database

Initially, the backend was not connected to `db-net`, so the database hostname
could not be resolved.

After connecting the backend to `db-net`:

```bash
docker network connect db-net backend
```

the following command was used:

```bash
docker exec backend wget -qO- http://db:3306
```

The result was:

```text
wget: bad header line: 8.4.9
```

This is expected because MySQL uses the MySQL protocol rather than HTTP.
The important point is that the `db` hostname was successfully resolved and
the backend reached the MySQL service.

The MySQL server itself was also verified using:

```bash
docker exec db mysqladmin ping -h localhost -uroot -prootpass
```

Result:

```text
mysqld is alive
```

### Screenshot

![alt text](images/connectivity.png)

---

# 4. Apache Using Host Network

The Apache HTTP Server Alpine image was pulled using:

```bash
docker pull httpd:alpine
```

A container was then created using Docker's host network:

```bash
docker run -d --name apache-host --network host httpd:alpine
```

The running container was checked using:

```bash
docker ps
```

The Apache server was verified from inside the container using:

```bash
docker exec apache-host wget -qO- http://localhost:80 | head
```

The server returned:

```text
<title>It works! Apache httpd</title>
```

The container logs also showed that Apache was running normally and returned
HTTP status `200` for the request.

### Note

`--network host` behaves differently on Docker Desktop (Windows and macOS)
than it does on native Linux. On Docker Desktop the containers run inside a
Linux VM, so the "host" is the VM and not the laptop itself. Because of this,
the host-networked container may not be reachable directly through
`http://localhost:80` from the browser even though Apache is running
correctly.

The internal HTTP request and Apache logs were therefore used as evidence
that the Apache server was functioning correctly.

### Screenshot

![Apache Host Network](images/apache.png)

---

# 5. Bind Mount

A local directory was created for the bind mount exercise:

```bash
mkdir -p docker-networking/bind-mount
cd docker-networking/bind-mount
```

An `index.html` file was created containing:

```text
Hello students
```

The Nginx container was started with the current directory mounted to the
Nginx web root:

```bash
docker run -d --name bind-nginx -p 8082:80 \
  -v "$(pwd):/usr/share/nginx/html" \
  nginx:alpine
```

The application was accessed through:

```text
http://localhost:8082
```

The browser initially displayed:

```text
Hello students
```

### Before Modification

![alt text](images/bind-mount-before.png)

---

## Modifying the Mounted File

The local `index.html` file was modified to:

```text
I am Palak Agrawal
```

The browser was refreshed without restarting the Nginx container.

The updated content appeared immediately:

```text
I am Palak Agrawal
```

This demonstrates that changes made to the host file are reflected inside
the container because the directory is bind mounted.

### After Modification

![alt text](images/bind-mount-after.png)

---

# 6. Understanding Overlay Networks

An overlay network is a Docker network designed to allow containers running on
different Docker hosts to communicate with each other.

Unlike a normal bridge network, which is generally limited to a single Docker
host, an overlay network can span multiple Docker hosts.

## Use Cases

Overlay networks are commonly used for:

- Docker Swarm services
- Multi-host container communication
- Distributed applications
- Microservice architectures
- Applications where containers need to communicate across different hosts

The basic idea is:

```text
Docker Host 1                  Docker Host 2
┌──────────────┐              ┌──────────────┐
│ Container A  │              │ Container B  │
└──────┬───────┘              └──────┬───────┘
       │                              │
       └──────── Overlay Network ─────┘
```

The overlay network provides a virtual network across the Docker hosts so
that containers can communicate as if they were connected to the same
logical network.

---

# 7. Important Commands

| Command | Purpose |
|---|---|
| `docker network create` | Creates a Docker network |
| `docker network ls` | Lists Docker networks |
| `docker network connect` | Connects a container to another network |
| `docker network inspect` | Displays detailed network information |
| `docker run --network` | Starts a container on a specified network |
| `docker exec` | Executes a command inside a running container |
| `docker pull` | Downloads an image from Docker Hub |
| `docker ps` | Lists running containers |
| `--network host` | Uses the host network for a container |
| `-v` | Creates a bind mount |
| `wget` | Tests HTTP connectivity |
| `mysqladmin ping` | Checks whether MySQL is running |

---

# 8. Key Learnings

Through these exercises, I learned:

1. Docker containers can communicate using Docker network names.
2. Custom bridge networks provide isolated communication between containers.
3. A single container can be connected to multiple networks.
4. Containers on the same network can resolve each other using container names.
5. Host networking removes the normal container network isolation.
6. Bind mounts allow files on the host to be shared directly with containers.
7. Changes to a bind-mounted file can be reflected without restarting the
   container.
8. Overlay networks can provide communication between containers running on
   different Docker hosts.

---

# Conclusion

This practical provided hands-on experience with Docker networking and
volumes.

I created multiple custom networks, connected frontend, backend and database
containers, tested container connectivity, used host networking with Apache,
and performed a bind mount with Nginx.

The exercises helped demonstrate how Docker provides networking isolation,
container discovery, multi-network connectivity, and persistent access to
host files through bind mounts.

## Student Information

**Name:** Palak Agrawal
**Roll No.:** 24BCS10504
