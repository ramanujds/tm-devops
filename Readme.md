
```bash
docker run -d -p 8100:8080 --name part-inventory-container ram1uj/part-inventory-service 
```


## Docker Image/Container commands

-   List all docker images

```bash

docker images 

```

- List all running docker containers

```bash
docker ps
```
- List all docker containers (running and stopped)

```bash
docker ps -a
```

- Stop a running docker container

```bash
docker stop <container_id>

docker stop part-inventory-container
docker stop nginx

```

- Remove a docker container

```bash
docker rm <container_id>
docker rm part-inventory-container
docker rm nginx
```


## Get inside a running docker container

```bash
docker exec -it <container_id> /bin/bash
docker exec -it part-inventory-container sh
docker exec -it nginx bash
```


## Container communication

- get the IP address of a running container

```bash
docker inspect part-inventory-container
```

- Execute a command inside a running container

```bash
docker exec -it nginx curl <ip-address>:8080/api/parts
```

## Building a docker image from a Dockerfile

```bash
docker build -t <image_name> <path_to_dockerfile>

docker build -t orderflow-lite -f Dockerfile-basic .

```