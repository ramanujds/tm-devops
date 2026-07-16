
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