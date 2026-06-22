param(
    [string]$Region = "us-east-1",
    [string]$InstanceType = "t3.medium",
    [string]$KeyName,
    [string]$SecurityGroupName = "googer-docker-server",
    [string]$AllowedSshCidr = "0.0.0.0/0",
    [string]$AllowedWebCidr = "0.0.0.0/0",
    [string]$SubnetId = "",
    [string]$Name = "googer-linux-docker",
    [int]$VolumeSizeGb = 40
)

$ErrorActionPreference = "Stop"

if (-not $KeyName) {
    throw "KeyName is required. Example: .\scripts\create-ubuntu-docker-ec2.ps1 -KeyName my-ec2-key"
}

if (-not (Get-Module -ListAvailable AWSPowerShell, AWS.Tools.EC2 | Select-Object -First 1)) {
    throw "AWS PowerShell module is not installed. Install AWSPowerShell or AWS.Tools.EC2 first."
}

Import-Module AWSPowerShell -ErrorAction SilentlyContinue
Set-DefaultAWSRegion -Region $Region

try {
    Get-STSCallerIdentity | Out-Null
} catch {
    throw "AWS credentials are not configured or do not have permission. Run Set-AWSCredential first, or attach an IAM role to this Windows EC2."
}

$images = Get-EC2Image `
    -Owner 099720109477 `
    -Filter @(
        @{ Name = "name"; Values = "ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*" },
        @{ Name = "architecture"; Values = "x86_64" },
        @{ Name = "virtualization-type"; Values = "hvm" },
        @{ Name = "root-device-type"; Values = "ebs" }
    )

$ami = $images | Sort-Object CreationDate -Descending | Select-Object -First 1
if (-not $ami) {
    throw "Could not find a current Ubuntu 24.04 AMI in region $Region."
}

$vpcId = ""
if ($SubnetId) {
    $subnet = Get-EC2Subnet -SubnetId $SubnetId
    $vpcId = $subnet.VpcId
} else {
    $vpc = Get-EC2Vpc -Filter @{ Name = "isDefault"; Values = "true" } | Select-Object -First 1
    if (-not $vpc) {
        throw "No default VPC found. Pass -SubnetId for the target VPC/subnet."
    }
    $vpcId = $vpc.VpcId
}

$sg = Get-EC2SecurityGroup -Filter @(
    @{ Name = "group-name"; Values = $SecurityGroupName },
    @{ Name = "vpc-id"; Values = $vpcId }
) | Select-Object -First 1

if (-not $sg) {
    $sgId = New-EC2SecurityGroup -GroupName $SecurityGroupName -Description "Googer Docker server access" -VpcId $vpcId
    $sg = Get-EC2SecurityGroup -GroupId $sgId
}

function Add-IngressRuleIfMissing {
    param(
        [string]$GroupId,
        [int]$Port,
        [string]$Cidr
    )

    $existing = (Get-EC2SecurityGroup -GroupId $GroupId).IpPermissions | Where-Object {
        $_.IpProtocol -eq "tcp" -and $_.FromPort -eq $Port -and $_.ToPort -eq $Port -and ($_.Ipv4Ranges.CidrIp -contains $Cidr)
    }

    if (-not $existing) {
        Grant-EC2SecurityGroupIngress -GroupId $GroupId -IpPermission @{
            IpProtocol = "tcp"
            FromPort = $Port
            ToPort = $Port
            Ipv4Ranges = @(@{ CidrIp = $Cidr })
        } | Out-Null
    }
}

Add-IngressRuleIfMissing -GroupId $sg.GroupId -Port 22 -Cidr $AllowedSshCidr
Add-IngressRuleIfMissing -GroupId $sg.GroupId -Port 80 -Cidr $AllowedWebCidr
Add-IngressRuleIfMissing -GroupId $sg.GroupId -Port 443 -Cidr $AllowedWebCidr

$userData = @'
#!/bin/bash
set -euxo pipefail

apt-get update
apt-get install -y ca-certificates curl git gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
usermod -aG docker ubuntu

mkdir -p /opt/googer
cd /opt/googer
git clone https://github.com/Sandil10/googernew.git || true
git clone https://github.com/Sandil10/googeradminpanel.git || true
chown -R ubuntu:ubuntu /opt/googer

cat >/opt/googer/README_NEXT_STEPS.txt <<'EOF'
Googer Docker server is ready.

Next:
1. SSH into the server.
2. cd /opt/googer/googernew
3. cp .env.docker.example .env.docker
4. Fill real production secrets in .env.docker.
5. docker compose up -d --build
EOF
'@

$encodedUserData = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($userData))

$blockDevice = New-Object Amazon.EC2.Model.BlockDeviceMapping
$blockDevice.DeviceName = "/dev/sda1"
$blockDevice.Ebs = New-Object Amazon.EC2.Model.EbsBlockDevice
$blockDevice.Ebs.VolumeSize = $VolumeSizeGb
$blockDevice.Ebs.VolumeType = "gp3"
$blockDevice.Ebs.DeleteOnTermination = $true

$runParams = @{
    ImageId = $ami.ImageId
    InstanceType = $InstanceType
    KeyName = $KeyName
    SecurityGroupId = $sg.GroupId
    MinCount = 1
    MaxCount = 1
    UserData = $encodedUserData
    BlockDeviceMapping = $blockDevice
}

if ($SubnetId) {
    $runParams.SubnetId = $SubnetId
}

$reservation = New-EC2Instance @runParams
$instanceId = $reservation.Instances[0].InstanceId

New-EC2Tag -Resource $instanceId -Tag @{ Key = "Name"; Value = $Name }

Write-Output "Created Ubuntu Docker server: $instanceId"
Write-Output "AMI: $($ami.ImageId) $($ami.Name)"
Write-Output "Security Group: $($sg.GroupId)"
Write-Output "Wait 2-4 minutes, then check public IP:"
Write-Output "Get-EC2Instance -InstanceId $instanceId | Select-Object -ExpandProperty Instances | Select-Object InstanceId,PublicIpAddress,State"
