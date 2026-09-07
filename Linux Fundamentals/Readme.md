# Linux Homework Tasks

## Task 1: Soft Link & Hard Link

### Difference Between Soft Link and Hard Link

| Soft Link (Symbolic Link) | Hard Link |
|---------------------------|-----------|
| Stores the path of the original file | Points directly to the file inode |
| Has its own inode number | Shares the same inode as the original |
| Can link across file systems | Cannot link across file systems |
| Can link directories | Cannot link directories (normally) |
| Breaks if the original file is deleted | Still works if the original file is deleted |
| Shown as `l` in `ls -l` | Shown as `-` (regular file) in `ls -l` |
| Created using `ln -s` | Created using `ln` |

### Commands

#### Create a File

```bash
touch file1.txt
echo "hello devops" > file1.txt
```

#### Create a Soft Link

```bash
ln -s file1.txt softlink.txt
```

#### Create a Hard Link

```bash
ln file1.txt hardlink.txt
```

#### View Links

```bash
ls -li
```

Output:

```
1443109 -rw-r--r-- 2 ubuntu ubuntu 13 Sep  6 19:20 file1.txt
1443109 -rw-r--r-- 2 ubuntu ubuntu 13 Sep  6 19:20 hardlink.txt
1443110 lrwxrwxrwx 1 ubuntu ubuntu  9 Sep  6 19:20 softlink.txt -> file1.txt
```

`file1.txt` and `hardlink.txt` share the same inode number and the link count is `2`.
`softlink.txt` has a different inode and a link count of `1`.

#### Check Where a Soft Link Points

```bash
readlink softlink.txt
readlink -f softlink.txt
```

#### Delete Soft Link

```bash
rm softlink.txt
```

#### Delete Hard Link

```bash
rm hardlink.txt
```

#### Delete Original File

```bash
rm file1.txt
```

After deleting the original file:

```bash
cat hardlink.txt      # works, data is still there
cat softlink.txt      # cat: softlink.txt: No such file or directory
```

### Interview Question

**Q: What is the difference between a soft link and a hard link?**

**Answer:**
A soft link stores the path of the original file and breaks if the original file is deleted.
A hard link points directly to the file inode, so it continues to work even if the original file is deleted.

**Q: Why can a hard link not cross file systems?**

**Answer:**
Inode numbers are unique only inside one file system, so a directory entry on one file system cannot refer to an inode on another.

**Q: Where are soft links used in real work?**

**Answer:**
Enabling nginx sites (`sites-enabled` -> `sites-available`), systemd service enabling, and pointing `current` to the latest release folder during deployment.

---

## Task 2: adduser vs useradd

### Difference

| adduser | useradd |
|----------|----------|
| User-friendly command | Low-level command |
| Creates home directory automatically | Requires additional options |
| Prompts for password and user details | Does not prompt |
| Perl script (wrapper around useradd) | Native binary |
| Preferred on Ubuntu | Mainly used for scripting |

### Recommended Command

Ubuntu recommends `adduser` because it creates the home directory, sets the shell and asks for the password in one step.

```bash
sudo adduser testuser
```

### Example

Create a user:

```bash
sudo adduser testuser
```

Verify the user was created:

```bash
id testuser
grep testuser /etc/passwd
ls /home
```

Switch to the user:

```bash
su - testuser
```

Give sudo access:

```bash
sudo usermod -aG sudo testuser
```

Same thing using `useradd` (needs extra options):

```bash
sudo useradd -m -s /bin/bash testuser2
sudo passwd testuser2
```

Delete the user:

```bash
sudo deluser testuser
sudo deluser --remove-home testuser
```

---

## Task 3: journalctl

### What is journalctl?

`journalctl` is used to view and manage logs collected by systemd's journal service (`systemd-journald`).
It replaces reading plain log files from `/var/log` for services managed by systemd.

### Useful Commands

View all logs:

```bash
journalctl
```

View recent logs:

```bash
journalctl -n 50
```

Follow logs in real time:

```bash
journalctl -f
```

View logs from current boot:

```bash
journalctl -b
```

View logs from the previous boot:

```bash
journalctl -b -1
```

View logs for a specific service:

```bash
journalctl -u ssh
```

Follow a specific service:

```bash
journalctl -u ssh -f
```

Example for Docker:

```bash
journalctl -u docker
```

View logs since today:

```bash
journalctl --since today
```

View logs for the last hour:

```bash
journalctl --since "1 hour ago"
```

View logs between two times:

```bash
journalctl --since "2026-09-06 10:00" --until "2026-09-06 12:00"
```

Show only errors:

```bash
journalctl -p err -b
```

Check journal disk usage and clean old logs:

```bash
journalctl --disk-usage
sudo journalctl --vacuum-time=7d
```

### Practice: Checking Logs for a Service

```bash
systemctl status ssh
journalctl -u ssh -n 20
sudo systemctl restart ssh
journalctl -u ssh -f
```

---

## Task 4: Linux Command Cheat Sheet

### File & Directory Commands

```bash
pwd          # print current directory
ls           # list files
ls -l        # long listing
ls -a        # include hidden files
cd           # change directory
mkdir        # create directory
rmdir        # remove empty directory
rm           # remove file (rm -r for directory)
cp           # copy
mv           # move or rename
touch        # create empty file
cat          # print file content
```

### File Viewing Commands

```bash
less         # scroll through a file
more         # simpler pager
head         # first 10 lines
tail         # last 10 lines
tail -f      # follow a file live
```

### Search Commands

```bash
find         # find files by name, size, type
grep         # search text inside files
which        # path of a command
```

### User Management Commands

```bash
whoami       # current user
who          # logged in users
id           # uid, gid and groups
adduser      # add user (interactive)
useradd      # add user (low level)
passwd       # change password
su           # switch user
sudo         # run as another user
```

### Process Commands

```bash
ps           # running processes
ps aux       # all processes
top          # live process view
htop         # better live process view
kill         # kill by PID
killall      # kill by name
```

### Disk Commands

```bash
df -h        # disk space used by file systems
du -sh       # size of a directory
lsblk        # list block devices
mount        # mount a file system
```

### Permission Commands

```bash
chmod        # change permissions
chown        # change owner
chgrp        # change group
umask        # default permission mask
```

### Networking Commands

```bash
ping         # check reachability
ip a         # show IP addresses
ss -tulnp    # listening ports
curl         # HTTP request
wget         # download file
netstat -tulnp
```

### System Information Commands

```bash
uname -a     # kernel and system info
hostname     # system hostname
uptime       # uptime and load
free -h      # memory usage
lscpu        # CPU details
date         # current date and time
```

### Service Commands

```bash
systemctl status <service>
systemctl start <service>
systemctl stop <service>
systemctl restart <service>
systemctl enable <service>
journalctl -u <service>
```

### Archive Commands

```bash
tar -czvf archive.tar.gz folder/    # compress
tar -xzvf archive.tar.gz            # extract
zip -r archive.zip folder/
unzip archive.zip
```

---
