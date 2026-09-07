#!/bin/bash

# Create directory
mkdir -p system_info_output
cd system_info_output

# Create file using touch
touch process.log

# Store data in variables
current_date=$(date)
current_hostname=$(hostname)
current_user=$(whoami)

# Print current date
echo "Current Date: $current_date"

# Print hostname and username
echo "Hostname: $current_hostname"
echo "Username: $current_user"
who
w

# Print disk usage
echo "Disk Usage:"
df

# Print running processes
ps

# Save process info inside process.log
ps > process.log

# Take input using read -p
read -p "Enter your name: " name
read -p "Enter your roll number: " roll_no
read -p "Enter your comment: " comment

# Print the entered details
echo "My name is $name"
echo "My roll number is $roll_no"
echo "My comment is: $comment"

# Also append name, roll no, comment to process.log
echo "My name is $name" >> process.log
echo "My roll number is $roll_no" >> process.log
echo "My comment is: $comment" >> process.log

echo "Process information saved to system_info_output/process.log"
